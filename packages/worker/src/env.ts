import type { SessionRoom } from "./sessionRoom.js";
import type { RateLimiter } from "./rateLimiter.js";

/** Bindings declared in wrangler.toml, surfaced to the Worker and DO. */
export interface Env {
  SESSION_ROOM: DurableObjectNamespace<SessionRoom>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  DB: D1Database;
  /** Which RestaurantSource to use: "google" (default in prod), "foursquare", or "mock". */
  RESTAURANT_SOURCE?: string;
  /** Google Places API (New) key. Restrict it to the Places API + your domain. */
  GOOGLE_PLACES_API_KEY?: string;
  FOURSQUARE_API_KEY?: string;
  /**
   * Public origin of this Worker's API (e.g. https://api.wherever.aidenjang.com), used to
   * build absolute photo-proxy URLs that the cross-origin web app can load in <img>. Empty
   * in dev, where Vite proxies /api to the Worker and relative URLs work.
   */
  PUBLIC_API_BASE?: string;
}
