import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env.js";
import { UsageMeter } from "../src/usageMeter.js";

const testEnv = env as unknown as Env;

// A fresh, uniquely-named meter per test so counts never bleed across cases.
function meter(name: string) {
  return testEnv.USAGE_METER.get(testEnv.USAGE_METER.idFromName(name));
}

describe("UsageMeter", () => {
  it("defaults every kind to 950 and preserves old reservations when adding geocoding", async () => {
    const m = meter(`legacy-${crypto.randomUUID()}`);
    await runInDurableObject(m, async (_instance, state) => {
      const configuredMeter = new UsageMeter(state, {
        ...testEnv,
        SEARCH_MONTHLY_CAP: undefined,
        PHOTO_MONTHLY_CAP: undefined,
        GEOCODE_MONTHLY_CAP: undefined,
      });
      const { month } = await configuredMeter.stats();
      await state.storage.put("usage", { month, search: 949, photo: 950 });
      expect(await configuredMeter.stats()).toEqual({
        month,
        search: 949,
        photo: 950,
        geocode: 0,
        caps: { search: 950, photo: 950, geocode: 950 },
      });
      expect(await configuredMeter.tryConsume("photo")).toBe(false);
      expect(await configuredMeter.tryConsume("search")).toBe(true);
      expect(await configuredMeter.tryConsume("search")).toBe(false);
    });
  });

  it.each(["1200", "Infinity", "-1", "2.5", "", "not-a-number", "0"])(
    "does not exceed 950 or fail open with the configured cap %j",
    async (configured) => {
      const m = meter(`configuration-${crypto.randomUUID()}`);
      await runInDurableObject(m, async (_instance, state) => {
        const configuredMeter = new UsageMeter(state, {
          ...testEnv,
          SEARCH_MONTHLY_CAP: configured,
          PHOTO_MONTHLY_CAP: configured,
          GEOCODE_MONTHLY_CAP: configured,
        });
        const cap = configured === "1200" ? 950 : 0;
        expect((await configuredMeter.stats()).caps).toEqual({ search: cap, photo: cap, geocode: cap });
        if (cap === 0) expect(await configuredMeter.tryConsume("photo")).toBe(false);
      });
    },
  );

  it("reserves only the remaining calls during a concurrent burst", async () => {
    const m = meter(`burst-${crypto.randomUUID()}`);
    await runInDurableObject(m, async (_instance, state) => {
      const configuredMeter = new UsageMeter(state, { ...testEnv, PHOTO_MONTHLY_CAP: "950" });
      const { month } = await configuredMeter.stats();
      await state.storage.put("usage", { month, search: 0, photo: 948, geocode: 0 });
      const allowed = await Promise.all(
        Array.from({ length: 30 }, () => configuredMeter.tryConsume("photo")),
      );
      expect(allowed.filter(Boolean)).toHaveLength(2);
      expect((await configuredMeter.stats()).photo).toBe(950);
    });
  });

  it.each([
    ["2026-11-01T06:59:59Z", "2026-11-01T07:00:00Z", "2026-10", "2026-11"],
    ["2026-01-01T07:59:59Z", "2026-01-01T08:00:00Z", "2025-12", "2026-01"],
  ])("resets at Pacific midnight across %s", async (before, after, previous, next) => {
    const m = meter(`rollover-${crypto.randomUUID()}`);
    await runInDurableObject(m, async (instance: UsageMeter, state) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date(before));
        const { caps } = await instance.stats();
        await state.storage.put("usage", { month: previous, search: caps.search, photo: 0 });
        expect((await instance.stats()).month).toBe(previous);
        expect(await instance.tryConsume("search")).toBe(false);
        vi.setSystemTime(new Date(after));
        expect(await instance.tryConsume("search")).toBe(true);
        expect(await instance.stats()).toMatchObject({ month: next, search: 1, photo: 0, geocode: 0 });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("counts consumes and reflects them in stats, independently per kind", async () => {
    const m = meter(`count-${crypto.randomUUID()}`);
    expect(await m.tryConsume("photo")).toBe(true);
    expect(await m.tryConsume("photo")).toBe(true);
    expect(await m.tryConsume("search")).toBe(true);

    const s = await m.stats();
    expect(s.photo).toBe(2);
    expect(s.search).toBe(1);
  });

  it("stops consuming once a kind hits its monthly cap", async () => {
    const m = meter(`cap-${crypto.randomUUID()}`);
    const { caps } = await m.stats();

    // Consume right up to the photo cap; every one should be allowed.
    for (let i = 0; i < caps.photo; i++) {
      expect(await m.tryConsume("photo")).toBe(true);
    }
    // Refused reservations must not advance the counter.
    expect(await m.tryConsume("photo")).toBe(false);
    expect(await m.tryConsume("photo")).toBe(false);

    // The other kind is unaffected by the photo cap.
    expect(await m.tryConsume("search")).toBe(true);

    const s = await m.stats();
    expect(s.photo).toBe(caps.photo); // never exceeded the cap
    expect(s.search).toBe(1);
  });
});
