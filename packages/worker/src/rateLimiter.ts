import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

/**
 * Fixed-window rate limiter. One instance per key (e.g. one per IP per action),
 * so the single-threaded guarantee makes the increment race-free.
 */
export class RateLimiter extends DurableObject<Env> {
  /** Records a hit; returns false once the window's limit is exceeded. */
  async hit(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const start = (await this.ctx.storage.get<number>("start")) ?? 0;
    let count = (await this.ctx.storage.get<number>("count")) ?? 0;

    if (now - start > windowMs) {
      await this.ctx.storage.put("start", now);
      count = 0;
    }
    count += 1;
    await this.ctx.storage.put("count", count);
    return count <= limit;
  }
}
