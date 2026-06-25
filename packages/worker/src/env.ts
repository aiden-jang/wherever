import type { SessionRoom } from "./sessionRoom.js";
import type { RateLimiter } from "./rateLimiter.js";

/** Bindings declared in wrangler.toml, surfaced to the Worker and DO. */
export interface Env {
  SESSION_ROOM: DurableObjectNamespace<SessionRoom>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  DB: D1Database;
  /** "mock" now, "foursquare" once a key is set (Phase 2). */
  RESTAURANT_SOURCE?: string;
  FOURSQUARE_API_KEY?: string;
}
