import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { createSessionSchema, type SessionFilters } from "@wherever/shared";
import { sessions } from "./db/schema.js";
import { generateSessionCode } from "./code.js";
import { isValidPhotoRef } from "./restaurantSource.js";
import type { Env } from "./env.js";

export { SessionRoom } from "./sessionRoom.js";
export { RateLimiter } from "./rateLimiter.js";

// At most this many session creations per IP per minute.
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

const app = new Hono<{ Bindings: Env }>();

// Log the real error server-side (visible in `wrangler tail` / Workers Logs) while keeping the
// client response generic. Without this, Hono swallows the cause as a bare "Internal Server Error".
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Something broke on our end." }, 500);
});

app.use("/api/*", cors());

app.get("/api/health", (c) =>
  c.json({ ok: true, source: c.env.RESTAURANT_SOURCE ?? "mock" }),
);

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

  const requested = Number(c.req.query("w")) || PHOTO_DEFAULT_WIDTH;
  const width = Math.min(Math.max(Math.trunc(requested), 1), PHOTO_MAX_WIDTH);

  const cache = caches.default;
  const cacheKey = new Request(new URL(c.req.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=${width}&key=${key}`;
  const res = await fetch(upstream);
  if (!res.ok) return c.json({ error: "Photo unavailable." }, 502);

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

export default app;
