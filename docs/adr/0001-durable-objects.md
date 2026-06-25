# ADR 0001: Cloudflare Durable Objects for realtime sessions

Status: accepted (Phase 0)

## Context

The core of the app is many people swiping on the same deck at the same time,
with the server deciding the moment a restaurant wins. That needs:

- a single authoritative place to count votes per session,
- "decide the winner exactly once" even when the last swipe and a host
  "decide now" arrive at the same instant,
- realtime fan-out to everyone in the session,
- and it has to run on a free tier (no always-on server budget).

A conventional long-running Node server (Fastify + ws + Redis) solves this but
needs a host that does not sleep, and the exactly-once decision becomes a
distributed-locking problem across instances.

## Decision

One session = one Durable Object (`SessionRoom`), addressed by session code.
The object owns every WebSocket for that session and holds the live vote tally
in memory. Durable cross-session data (session records, visited-places history)
lives in D1 via Drizzle. The web client is static on Cloudflare Pages.

## Consequences

Good:

- A Durable Object is single-threaded, so counting a vote and deciding a winner
  cannot interleave. Exactly-once is free, no Redis, no locks.
- The session is naturally an actor; the primitive matches the problem shape.
- Runs entirely on free tiers with no sleep/cold-start penalty for the realtime
  path.
- Removes Redis from the stack.

Costs / tradeoffs:

- Cloudflare-specific. Local dev and integration tests run through Wrangler /
  Miniflare rather than a plain Node harness.
- Diverges from our other project's raw-ws + Redis pattern, so less shared
  muscle memory.
