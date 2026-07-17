import type { SessionRoom } from "./sessionRoom.js";
import type { RateLimiter } from "./rateLimiter.js";
import type { UsageMeter } from "./usageMeter.js";

/** Bindings declared in wrangler.toml, surfaced to the Worker and DO. */
export interface Env {
  SESSION_ROOM: DurableObjectNamespace<SessionRoom>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  /** Global monthly counter that caps paid Google calls to keep usage in the free tier. */
  USAGE_METER: DurableObjectNamespace<UsageMeter>;
  DB: D1Database;
  /** Monthly cap on Google Nearby Search calls before the app stops calling Google. Default 950. */
  SEARCH_MONTHLY_CAP?: string;
  /** Monthly cap on Google Place Photo fetches before the app serves fallbacks. Default 950. */
  PHOTO_MONTHLY_CAP?: string;
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
