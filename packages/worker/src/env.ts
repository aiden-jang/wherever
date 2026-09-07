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
  /** Grace before a departed host is replaced. Configurable so a test need not wait it out. */
  HOST_GRACE_MS?: string;
  /** Monthly cap on Google Place Photo fetches before the app serves fallbacks. Default 950. */
  PHOTO_MONTHLY_CAP?: string;
  /** Which RestaurantSource to use: "google" (default in prod) or "mock". */
  RESTAURANT_SOURCE?: string;
  /** Google Places API (New) key. Restrict it to the Places API + your domain. */
  GOOGLE_PLACES_API_KEY?: string;
  /**
   * Absolute origin to prefix photo-proxy URLs with. Unset: the SPA and the API share one
   * origin, so those URLs are relative. Only needed if the API is ever split back out.
   */
  PUBLIC_API_BASE?: string;
  /** The built SPA (packages/web/dist), served from this same Worker. */
  ASSETS: Fetcher;
  /** Optional so local dev and the test worker run without it: an absent binding drops events. */
  EVENTS?: AnalyticsEngineDataset;
}
