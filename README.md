# Wherever, Honestly

> Everyone swipes. Majority wins. Dinner is decided before the group chat even starts typing.

A group picks a restaurant by swiping, instead of sending 60 messages and eating cereal at 9pm. Join a session, swipe left or right on nearby spots, and the place with the most yeses wins. You can dislike something, but the group does not care about your feelings. That is the point.

## What it does

- **Swipe to vote.** Left or right on each restaurant. Arrow keys work on desktop.
- **Group matching.** Everyone in a session votes on the same deck in real time.
- **Majority wins.** A left swipe is a downvote, not a veto. One picky person cannot tank dinner.
- **No accounts.** Type a name, share a code, done.
- **Remembers where you went.** Already-visited spots stop showing up.

> Part of the [platform monorepo](../../README.md). Unlike the other apps (which serve their SPA
> from the Worker), wherever keeps its web and worker as **separate deploys** — the Worker is
> pure API + realtime, the web is a standalone PWA.

## Stack

- **Web:** React + Vite + Tailwind v4, mobile-first, installable as a PWA, deploys to Cloudflare Pages
- **Realtime + API:** a Cloudflare Worker (Hono) with one **Durable Object per session** (`SessionRoom`) holding live vote state. See [ADR 0001](docs/adr/0001-durable-objects.md).
- **Durable data:** Cloudflare D1 (SQLite) + Drizzle
- **Validation:** Zod at every HTTP and WebSocket boundary
- **Restaurant data:** Google Places API (New), behind a swappable `RestaurantSource` interface with a seeded mock fallback (Foursquare kept as an alternate implementation)

Runs entirely on free tiers.

## Getting started

Requires **Node 22** (repo `.nvmrc`) and pnpm. No Docker needed; Wrangler runs the Worker, Durable Object, and a local D1 for you.

```bash
corepack enable               # makes pnpm available
pnpm install

# Terminal 1: the Worker + Durable Object + local D1
pnpm --filter @wherever/worker dev    # http://localhost:8787

# Terminal 2: the web app (proxies /api and /ws to the Worker)
pnpm --filter @wherever/web dev       # http://localhost:5173
```

Set `RESTAURANT_SOURCE=google` and a `GOOGLE_PLACES_API_KEY` (`wrangler secret`) to use live data;
without a key the seeded mock deck keeps the app fully playable. See
`packages/worker/.dev.vars.example`. Restrict the key to the Places API and set a per-API usage
quota to stay inside the budget. To use Foursquare instead, set `RESTAURANT_SOURCE=foursquare` and
`FOURSQUARE_API_KEY`.

## Project layout

```
packages/
  shared/   # types, websocket protocol, Zod schemas (imported by both sides)
  worker/   # Cloudflare Worker (Hono) + SessionRoom Durable Object + D1/Drizzle
  web/      # React client
docs/adr/   # architecture decision records
```

## Deploy

Runs entirely on Cloudflare's free tier (Worker + Durable Objects + D1, plus Pages for the web app). See [DEPLOY.md](DEPLOY.md) for the step-by-step.

## Roadmap

All phases complete:

0. Scaffold + landing
1. Sessions + lobby (create, join by code, live presence), Zod validation
2. Restaurant deck + swipe UI (drag, buttons, keyboard)
3. Realtime voting + match detection: pure decision core with unit tests, idempotent votes, decide-exactly-once, reconnection
4. Majority decision logic + "decide now" (folded into 3)
5. Visited-places history (D1), excluded from future rounds, "pick again"
6. Polish (PWA install, reconnect + not-found states), rate limiting, deploy prep
