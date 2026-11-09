import { handleAnalytics } from "../../../analytics/worker.js";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { CODE_ALPHABET, CODE_LENGTH, type SessionFilters } from "@wherever/shared";
import { createSessionSchema } from "@wherever/shared/schemas";
import { sessions } from "./db/schema.js";
import { pruneOldSessions } from "./sessionRetention.js";
import { generateSessionCode } from "./code.js";
import { isValidPhotoRef } from "./googlePlace.js";
import type { Env } from "./env.js";

export { SessionRoom } from "./sessionRoom.js";
export { RateLimiter } from "./rateLimiter.js";
export { UsageMeter } from "./usageMeter.js";

// At most this many session creations per IP per minute.
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

const app = new Hono<{ Bindings: Env }>();

// Default caller-dependent responses to no-store; preserve a route's explicit cache policy.
app.use("*", async (c, next) => {
  await next();
  // Vite's hashed bundles cannot change under a given name, so a year and `immutable`. Workers
  // Assets serves them `max-age=0, must-revalidate`, which spends a round trip per chunk on every
  // repeat visit. index.html keeps its name across deploys and must still revalidate.
  if (/^\/assets\//.test(c.req.path)) {
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  if (!c.res.headers.get("cache-control")) {
    c.header("Cache-Control", "no-store, max-age=0");
    c.header("Pragma", "no-cache");
  }
});

// Log the real error server-side (visible in `wrangler tail` / Workers Logs) while keeping the
// client response generic. Without this, Hono swallows the cause as a bare "Internal Server Error".
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Something broke on our end. Not your fault." }, 500);
});

app.all("/api/analytics", (c) => handleAnalytics(c.req.raw, c.env));

app.get("/api/health", (c) => c.json({ ok: true, source: c.env.RESTAURANT_SOURCE ?? "mock" }));

// Reservations include failed provider calls, so these are call limits rather than billed usage.
app.get("/api/usage", async (c) => {
  const meter = c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName("global"));
  return c.json(await meter.stats());
});

// Reserve the creator’s seat before publishing the invite code.
app.post("/api/sessions", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(`create:${ip}`));
  if (!(await limiter.hit(CREATE_LIMIT, CREATE_WINDOW_MS))) {
    return c.json({ error: "Slow down. Too many sessions." }, 429);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    const needsCreator = parsed.error.issues.some((issue) => issue.path[0] === "clientId");
    return c.json(
      { error: needsCreator ? "Reload Wherever before creating a room." : "Invalid session setup." },
      400,
    );
  }

  const db = drizzle(c.env.DB);
  const code = generateSessionCode();
  const id = crypto.randomUUID();
  const filters: SessionFilters = parsed.data.filters;
  const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);

  await db.insert(sessions).values({
    id,
    code,
    status: "lobby",
    voteMode: "majority",
    filters: JSON.stringify(filters),
    createdAt,
  });

  // Seed the Durable Object that will own this session's realtime state.
  const room = c.env.SESSION_ROOM.get(c.env.SESSION_ROOM.idFromName(code));
  if (
    !(await room.initialize(
      { code, status: "lobby", voteMode: "majority", filters },
      createdAt.getTime(),
      parsed.data.clientId,
    ))
  ) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return c.json({ error: "Could not reserve a new room. Please try again." }, 503);
  }

  return c.json({ code }, 201);
});

// Geocode a ZIP code or town without storing the provider’s formatted address in a shared cache.
const GEOCODE_LIMIT = 20;
const GEOCODE_WINDOW_MS = 60_000;

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

  const meter = c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName("global"));
  if (!(await meter.tryConsume("geocode"))) {
    return c.json({ error: "Monthly location search budget reached." }, 429);
  }

  const upstream = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;
  const res = await fetch(upstream, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!res?.ok) {
    console.warn("geocode upstream", res?.status);
    return c.json({ error: "Location search failed." }, 502);
  }
  const data = (await res.json().catch(() => null)) as {
    status?: string;
    results?: {
      formatted_address?: string;
      partial_match?: boolean;
      geometry?: { location?: { lat: number; lng: number } };
    }[];
  } | null;

  const top = data?.results?.[0];
  const loc = top?.geometry?.location;
  if (data?.status === "ZERO_RESULTS") {
    return c.json({ error: "Couldn't find that place." }, 404);
  }
  if (data?.status !== "OK" || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    const codes = [
      "REQUEST_DENIED",
      "OVER_QUERY_LIMIT",
      "OVER_DAILY_LIMIT",
      "INVALID_REQUEST",
      "UNKNOWN_ERROR",
    ];
    console.warn("geocode_failed", {
      status: codes.includes(data?.status ?? "") ? data?.status : "INVALID_RESPONSE",
    });
    return c.json({ error: "Location search is unavailable. Try again shortly." }, 502);
  }

  if (top.partial_match || (data.results?.length ?? 0) > 1) {
    return c.json(
      { error: "More than one area may match. Enter a ZIP code or add a state or country." },
      409,
    );
  }
  return c.json({ lat: loc.lat, lng: loc.lng, label: (top.formatted_address ?? q).slice(0, 80) });
});

// Google photo names can expire. Fetch only when an image is requested and do not cache its bytes.
const PHOTO_MAX_WIDTH = 1600;
const PHOTO_DEFAULT_WIDTH = 800;

app.get("/api/photo", async (c) => {
  const ref = c.req.query("ref") ?? "";
  if (!isValidPhotoRef(ref)) return c.json({ error: "Bad photo reference." }, 400);

  const key = c.env.GOOGLE_PLACES_API_KEY;
  if (!key) return c.json({ error: "Photos are not available." }, 404);

  const requested = Number(c.req.query("w")) || PHOTO_DEFAULT_WIDTH;
  const width = [400, 800, PHOTO_MAX_WIDTH].find((candidate) => requested <= candidate) ?? PHOTO_MAX_WIDTH;

  const ip = c.req.header("cf-connecting-ip");
  if (ip) {
    const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(`photo:${ip}`));
    if (!(await limiter.hit(60, 60_000))) return c.json({ error: "Too many photo requests." }, 429);
  }

  const meter = c.env.USAGE_METER.get(c.env.USAGE_METER.idFromName("global"));
  if (!(await meter.tryConsume("photo"))) {
    return c.json({ error: "Monthly photo budget reached." }, 429);
  }

  const upstream = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${width}&key=${key}`;
  const res = await fetch(upstream, { signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!res?.ok) {
    // Status identifies provider failures without retaining location or credential-bearing bodies.
    console.warn("photo proxy upstream", res?.status);
    return c.json({ error: "Photo unavailable." }, 502);
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
});

// Hand the WebSocket upgrade to the Durable Object that owns this session code.
app.get("/ws/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (code.length !== CODE_LENGTH || [...code].some((character) => !CODE_ALPHABET.includes(character))) {
    return c.json({ error: "Invalid room code." }, 400);
  }
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) {
    return c.json({ error: "Open the invite from Wherever." }, 403);
  }
  const ip = c.req.header("cf-connecting-ip");
  if (ip) {
    const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(`socket:${ip}`));
    if (!(await limiter.hit(60, 60_000))) return c.json({ error: "Too many connection attempts." }, 429);
  }
  const id = c.env.SESSION_ROOM.idFromName(code);
  const room = c.env.SESSION_ROOM.get(id);
  return room.fetch(c.req.raw);
});

// Anything that is not the API is the SPA: real files, with index.html as the fallback so client
// routes resolve. Registered last so it can never shadow a route above it.
app.all("/api/*", (c) => c.json({ error: "Unknown API endpoint." }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: async (_controller, env: Env): Promise<void> => {
    await pruneOldSessions(env);
  },
} satisfies ExportedHandler<Env>;
