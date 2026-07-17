import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";

const testEnv = env as unknown as Env;

// A fresh, uniquely-named meter per test so counts never bleed across cases.
function meter(name: string) {
  return testEnv.USAGE_METER.get(testEnv.USAGE_METER.idFromName(name));
}

describe("UsageMeter", () => {
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
    // The next one is refused — this is the circuit breaker that keeps the bill at zero.
    expect(await m.tryConsume("photo")).toBe(false);
    expect(await m.tryConsume("photo")).toBe(false);

    // The other kind is unaffected by the photo cap.
    expect(await m.tryConsume("search")).toBe(true);

    const s = await m.stats();
    expect(s.photo).toBe(caps.photo); // never exceeded the cap
    expect(s.search).toBe(1);
  });
});
