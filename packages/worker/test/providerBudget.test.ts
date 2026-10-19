import { env } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";
import type { Env } from "../src/env.js";
import type { UsageMeter } from "../src/usageMeter.js";
import { fetchFreshDeck, readDemoMode } from "../src/deckSource.js";

const bindings = { ...(env as unknown as Env), GOOGLE_PLACES_API_KEY: "budget-test-only" };
const meter = () => bindings.USAGE_METER.get(bindings.USAGE_METER.idFromName("global"));
const photoPath = () => `/api/photo?ref=places/test/photos/${crypto.randomUUID()}`;
const geocodePath = () => `/api/geocode?q=${crypto.randomUUID()}`;

async function request(path: string) {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(`https://budget.test${path}`), bindings, context);
  await waitOnExecutionContext(context);
  return response;
}

async function exhaust(kind: "search" | "photo" | "geocode") {
  await runInDurableObject(meter(), async (instance: UsageMeter, state) => {
    const current = await instance.stats();
    await state.storage.put("usage", { ...current, [kind]: current.caps[kind] });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("provider budget enforcement", () => {
  it("uses labeled sample restaurants without contacting Google after the search cap", async () => {
    await exhaust("search");
    const upstream = vi.spyOn(globalThis, "fetch");
    const room = bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(crypto.randomUUID()));
    await runInDurableObject(room, async (_instance, state) => {
      await fetchFreshDeck({
        storage: state.storage,
        env: { ...bindings, RESTAURANT_SOURCE: "google" },
        meta: {
          code: "BUDGET",
          status: "lobby",
          voteMode: "majority",
          filters: { radiusMeters: 8000, maxPriceTier: 4, categories: [] },
        },
        vibeCounts: {},
      });
      expect(await readDemoMode(state.storage)).toBe("budget");
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    ["photo", photoPath],
    ["geocode", geocodePath],
  ] as const)("never contacts Google after the %s cap", async (kind, path) => {
    await exhaust(kind);
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not used"));
    expect((await request(path())).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("caps concurrent photo cache misses before sending upstream requests", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    const { caps } = await meter().stats();
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(photoPath())));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(caps.photo);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(12 - caps.photo);
    expect(upstream).toHaveBeenCalledTimes(caps.photo);
    expect((await meter().stats()).photo).toBe(caps.photo);
  });

  it.each([
    ["photo", photoPath],
    ["geocode", geocodePath],
  ] as const)("keeps failed %s attempts charged against the cap", async (kind, path) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const { caps } = await meter().stats();
    for (let i = 0; i < caps[kind]; i += 1) expect((await request(path())).status).toBe(502);
    expect((await request(path())).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(caps[kind]);
  });

  it.each([
    ["photo", photoPath, () => new Response("photo", { headers: { "Content-Type": "image/jpeg" } })],
    [
      "geocode",
      geocodePath,
      () => Response.json({ status: "OK", results: [{ geometry: { location: { lat: 40, lng: -74 } } }] }),
    ],
  ] as const)(
    "serves cached %s results after the cap without spending another call",
    async (kind, path, result) => {
      const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () => result());
      const url = path();
      expect((await request(url)).status).toBe(200);
      await exhaust(kind);
      expect((await request(url)).status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(1);
    },
  );

  it.each([photoPath, geocodePath])("fails closed when the meter is unavailable for %s", async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = vi.spyOn(globalThis, "fetch");
    const broken = {
      ...bindings,
      USAGE_METER: {
        idFromName: () => {
          throw new Error("meter unavailable");
        },
      },
    } as unknown as Env;
    const context = createExecutionContext();
    const response = await worker.fetch(new Request(`https://budget.test${path()}`), broken, context);
    expect(response.status).toBe(500);
    expect(upstream).not.toHaveBeenCalled();
  });
});
