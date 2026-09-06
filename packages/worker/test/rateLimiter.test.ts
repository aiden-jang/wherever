import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.js";

const testEnv = env as unknown as Env;

/*
 * The thing between a script and unlimited session creation, and - more expensively - unlimited
 * geocoding, which is a paid Google call. It had no test.
 *
 * A fresh, uniquely-named limiter per case, because these are Durable Objects and a shared name is
 * shared state across tests.
 */
function limiter(name: string) {
  return testEnv.RATE_LIMITER.get(testEnv.RATE_LIMITER.idFromName(name));
}

describe("RateLimiter", () => {
  it("allows exactly the limit, then refuses", async () => {
    const l = limiter(`limit-${crypto.randomUUID()}`);
    for (let i = 0; i < 3; i += 1) {
      expect(await l.hit(3, 60_000), `hit ${i + 1} of 3`).toBe(true);
    }
    expect(await l.hit(3, 60_000), "the fourth").toBe(false);
    // And stays refused. A limiter that lets the next one through is a speed bump, not a limit.
    expect(await l.hit(3, 60_000)).toBe(false);
  });

  it("lets the next window through", async () => {
    const l = limiter(`window-${crypto.randomUUID()}`);
    /*
     * The window is per call, so the refusal is read under one nothing can cross and the expiry
     * under one anything can. Both halves used to share a 5ms window: two calls that straddled it
     * reset instead of refusing, so the second returned true and the test failed on how busy the
     * machine was. Widening it would have made that rarer; asserting the refusal under a window no
     * pair of round trips can span removes it.
     */
    expect(await l.hit(1, 60_000)).toBe(true);
    expect(await l.hit(1, 60_000)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await l.hit(1, 20), "a fresh window").toBe(true);
  });

  it("counts each key on its own", async () => {
    const mine = limiter(`create:1.2.3.4-${crypto.randomUUID()}`);
    const theirs = limiter(`create:5.6.7.8-${crypto.randomUUID()}`);

    expect(await mine.hit(1, 60_000)).toBe(true);
    expect(await mine.hit(1, 60_000)).toBe(false);
    // One person hammering the endpoint must not lock anybody else out.
    expect(await theirs.hit(1, 60_000)).toBe(true);
  });
});
