import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import { createSessionSchema, type SessionFilters } from "@wherever/shared";
import { sessions } from "./db/schema.js";
import { generateSessionCode } from "./code.js";
import type { Env } from "./env.js";

export { SessionRoom } from "./sessionRoom.js";
export { RateLimiter } from "./rateLimiter.js";

// At most this many session creations per IP per minute.
const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

const app = new Hono<{ Bindings: Env }>();

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

// Hand the WebSocket upgrade to the Durable Object that owns this session code.
app.get("/ws/:code", (c) => {
  const code = c.req.param("code").toUpperCase();
  const id = c.env.SESSION_ROOM.idFromName(code);
  const room = c.env.SESSION_ROOM.get(id);
  return room.fetch(c.req.raw);
});

export default app;
