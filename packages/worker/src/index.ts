import { Hono } from "hono";
import { cors } from "hono/cors";
import { lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createSessionSchema, type SessionFilters } from "@wherever/shared";
import { sessions, visitedPlaces } from "./db/schema.js";
import { generateSessionCode } from "./code.js";
import { isValidPhotoRef } from "./restaurantSource.js";
import type { Env } from "./env.js";

export { SessionRoom } from "./sessionRoom.js";
export { RateLimiter } from "./rateLimiter.js";
export { UsageMeter } from "./usageMeter.js";

// At most this many session creations per IP per minute.
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

const app = new Hono<{ Bindings: Env }>();

/*
 * Per-user responses must never be stored.
 *
 * A GET with no `Cache-Control` is heuristically cacheable, so the browser invents a freshness
 * lifetime and keeps it. That shipped in accounts: sign out, press back, and the browser answers the
 * session check from its own cache so you look signed in until a refresh. It cuts both ways - a
 * cached signed-out answer keeps telling a freshly signed-in person they are signed out.
 *
 * Conditional on purpose. A route that already chose its own caching knows something this does not.
 */
app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.get('cache-control')) {
    c.header('Cache-Control', 'no-store, max-age=0');
    c.header('Pragma', 'no-cache');
  }
});


// Log the real error server-side (visible in `wrangler tail` / Workers Logs) while keeping the
// client response generic. Without this, Hono swallows the cause as a bare "Internal Server Error".
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Something broke on our end. Not your fault." }, 500);
});

// Same-origin now, so the browser sends no preflight for the SPA's own calls. Still here for
// the old api.* host, which is cross-origin to anyone still loading the previous bundle.
app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({ ok: true, source: c.env.RESTAURANT_SOURCE ?? "mock" }),
);

// This month's Google usage vs. the caps that stop the app from calling Google. Handy for keeping
// an eye on how close you are to the free tier.
app.get("/api/usage", async (c) => {
  const meter = c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName("global"));
  return c.json(await meter.stats());
});

// Create a session: rate-limit, validate input, mint an unguessable code,
// persist it. The Durable Object is created lazily on first WS connect.
app.post("/api/sessions", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const limiter = c.env.RATE_LIMITER.get(
    c.env.RATE_LIMITER.idFromName(`create:${ip}`),
  );
  if (!(await limiter.hit(CREATE_LIMIT, CREATE_WINDOW_MS))) {
    return c.json({ error: "Slow down. Too many sessions." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid session setup." }, 400);
  }

  const db = drizzle(c.env.DB);
  const code = generateSessionCode();
  const id = crypto.randomUUID();
  const filters: SessionFilters = parsed.data.filters;

  await db.insert(sessions).values({
    id,
    code,
    status: "lobby",
    voteMode: "majority",
    filters: JSON.stringify(filters),
  });

  // Seed the Durable Object that will own this session's realtime state.
  const room = c.env.SESSION_ROOM.get(c.env.SESSION_ROOM.idFromName(code));
  await room.initialize({ code, status: "lobby", voteMode: "majority", filters });

  return c.json({ code }, 201);
});

// Geocode a zip/town to a search center, keeping the Google key server-side. Rate-limited per IP
// and edge-cached (geocodes are stable), so "search another area" costs at most one paid Geocoding
// call per distinct query per cache window. Requires the Geocoding API enabled on the key.
const GEOCODE_LIMIT = 20;
const GEOCODE_WINDOW_MS = 60_000;
const GEOCODE_CACHE_SECONDS = 86_400; // 1 day

app.get("/api/geocode", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2 || q.length > 120) {
    return c.json({ error: "Enter a zip code or town." }, 400);
  }

  const key = c.env.GOOGLE_PLACES_API_KEY;
  if (!key) return c.json({ error: "Location search is not available." }, 404);

  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(`geocode:${ip}`));
  if (!(await limiter.hit(GEOCODE_LIMIT, GEOCODE_WINDOW_MS))) {
    return c.json({ error: "Slow down on the location search." }, 429);
  }

  // Edge-cache by the normalized query so repeats don't re-bill Google.
  const cache = caches.default;
  const cacheUrl = new URL(c.req.url);
  cacheUrl.searchParams.set("q", q.toLowerCase());
  const cacheKey = new Request(cacheUrl.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;
  const res = await fetch(upstream);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn(`geocode upstream ${res.status}: ${detail.slice(0, 300)}`);
    return c.json({ error: "Location search failed." }, 502);
  }
  const data = (await res.json().catch(() => null)) as {
    status?: string;
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat: number; lng: number } };
    }[];
  } | null;

  const top = data?.results?.[0];
  const loc = top?.geometry?.location;
  if (data?.status !== "OK" || !loc) {
    return c.json({ error: "Couldn't find that place." }, 404);
  }

  const out = c.json({ lat: loc.lat, lng: loc.lng, label: top?.formatted_address ?? q });
  out.headers.set("Cache-Control", `public, max-age=${GEOCODE_CACHE_SECONDS}`);
  c.executionCtx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
});

// Proxy a Google Place photo, keeping the API key server-side. The deck's imageUrl points here.
// Edge-cached so the paid Place Photo SKU is fetched at most once per (photo, width).
const PHOTO_MAX_WIDTH = 1600;
const PHOTO_DEFAULT_WIDTH = 800;
const PHOTO_CACHE_SECONDS = 2_592_000; // 30 days

app.get("/api/photo", async (c) => {
  const ref = c.req.query("ref") ?? "";
  if (!isValidPhotoRef(ref)) return c.json({ error: "Bad photo reference." }, 400);

  const key = c.env.GOOGLE_PLACES_API_KEY;
  if (!key) return c.json({ error: "Photos are not available." }, 404);

  // Snap to a small set of widths so a valid ref can't be abused to force hundreds of distinct
  // paid Place-Photo fetches (one per arbitrary w). Cache by the SNAPPED width so every request in
  // a bucket shares one cache entry and one upstream fetch.
  const requested = Number(c.req.query("w")) || PHOTO_DEFAULT_WIDTH;
  const allowedWidths = [400, 800, PHOTO_MAX_WIDTH];
  const width = allowedWidths.find((w) => requested <= w) ?? PHOTO_MAX_WIDTH;

  const cache = caches.default;
  const normalized = new URL(c.req.url);
  normalized.searchParams.set("w", String(width));
  const cacheKey = new Request(normalized.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Cache miss → this would be a paid Place Photo fetch. Gate it on the monthly budget so we never
  // spill past Google's free tier; over budget, the client's <img> onError shows the emoji fallback.
  const meter = c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName("global"));
  if (!(await meter.tryConsume("photo"))) {
    return c.json({ error: "Monthly photo budget reached." }, 429);
  }

  const upstream = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${width}&key=${key}`;
  const res = await fetch(upstream);
  if (!res.ok) {
    // Surface why Google rejected the photo (403 = key/restriction/billing, 404 = stale ref,
    // etc.) instead of a bare 502. Shows in `wrangler tail` and Workers Logs.
    const detail = await res.text().catch(() => "");
    console.warn(`photo proxy upstream ${res.status}: ${detail.slice(0, 300)}`);
    return c.json({ error: "Photo unavailable." }, 502);
  }

  const out = new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": `public, max-age=${PHOTO_CACHE_SECONDS}, immutable`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
});

// Hand the WebSocket upgrade to the Durable Object that owns this session code.
app.get("/ws/:code", (c) => {
  const code = c.req.param("code").toUpperCase();
  const id = c.env.SESSION_ROOM.idFromName(code);
  const room = c.env.SESSION_ROOM.get(id);
  return room.fetch(c.req.raw);
});

// Anything that is not the API is the SPA: real files, with index.html as the fallback so client
// routes resolve. Registered last so it can never shadow a route above it.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// Sessions (and their visited-history) are ephemeral — one dinner decision. Prune anything past the
// TTL on a daily cron so D1 doesn't grow without bound. There's no FK cascade, so both tables are
// swept by age. 7 days keeps a shared result link valid for about a week.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function pruneOldSessions(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  const db = drizzle(env.DB);
  await db.delete(sessions).where(lt(sessions.createdAt, cutoff));
  await db.delete(visitedPlaces).where(lt(visitedPlaces.visitedAt, cutoff));
}

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env: Env): Promise<void> => {
    await pruneOldSessions(env);
  },
} satisfies ExportedHandler<Env>;
