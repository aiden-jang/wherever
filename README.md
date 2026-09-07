# Wherever, Honestly

> Everyone swipes. Majority wins. Dinner is decided before the group chat even starts typing.

A group picks a restaurant by swiping, instead of sending 60 messages and eating cereal at 9pm. Join a session, swipe left or right on nearby spots, and the place with the most yeses wins. You can dislike something, but the group does not care about your feelings. That is the point.

## What it does

- **Swipe to vote.** Left or right on each restaurant. Arrow keys work on desktop; tap a card for a photo gallery, hours, price range, amenities, and a short blurb.
- **Group matching.** Everyone in a session votes on the same deck in real time.
- **Majority wins.** A left swipe is a downvote, not a veto, so no amount of passing tanks a place
  on its own. The one exception is deliberate and rationed: each person gets a single veto per round
  that kills one place outright, anonymously, and the group is told when it took their top pick.
- **Super-like.** One weighted pick per round that can tip a close race. The gold flash is yours
  alone, because everyone is on a different card; the room finds out on the result screen, which
  says when a super-like beat the headcount.
- **Round timer (optional).** The host sets a countdown; when it's up, the votes so far decide, with no more waiting on the slow one.
- **Filter like you mean it.** Cuisines to include _or_ exclude, exact price levels, amenities (outdoor seating, veg-friendly, dog-friendly, takes-reservations…), rating/review floors, and one-tap presets ("Cheap & close", "Date night").
- **Show who's voted, or don't.** The host chooses; anonymous is the default and enforced server-side.
- **No accounts.** Type a name, share a code, done.
- **Remembers where you went.** Already-visited spots stop showing up.
- **Joins the way people actually share.** Point your camera at somebody's join QR, or share the
  invite link _into_ the installed app from any chat and land straight in the session.
- **Behaves like an app on the home screen.** Long-press for "Start a session" or "Join with a code",
  a badge on the icon counting the cards the room is waiting on you for, and the screen stays awake
  while a round is running, because a table of dark phones is how a round stalls.

> Part of a [platform of apps](https://github.com/aiden-jang/auth/blob/main/PLATFORM.md) that share one sign-in. Like the others, one Worker serves both the
> SPA and the API from a single origin. It used to be two deploys, a Pages site calling an
> `api.` subdomain, which meant CORS, a build-time API base, and a dev setup whose origin
> topology did not match production.

## How it works

The Worker (Hono) is the API, the realtime layer, and the host for the installable PWA that talks to it
over HTTP and a WebSocket. Each session is owned by **one Durable Object** (`SessionRoom`) that is
the single authority for that session's live state: roster, the shared deck, and every vote. Durable
data (sessions, visited history) lives in Cloudflare D1 via Drizzle. Every HTTP and WebSocket payload
is validated with Zod at the boundary, so nothing untrusted reaches the game logic. It all runs on
free tiers.

Restaurants come from the Google Places API (New), reached through a swappable `RestaurantSource`
interface. Without an API key the app falls back to a seeded mock deck, so it is fully playable
offline and in CI.

## Testing

- **Pure decision core.** The "has the group decided" logic is unit-tested with no I/O, covering
  idempotent votes, decide-exactly-once, and majority edge cases.
- **Data-source adapter.** The `RestaurantSource` normalization and mock fallback are covered so a
  provider change or a bad upstream response cannot silently corrupt the deck.
- **Session lifecycle.** The full join / vote / decide / reconnect flow runs against the **real
  Workers runtime** via `@cloudflare/vitest-pool-workers`, with migrations applied to an in-memory
  D1 per file. The suite covers the decision core (including super-like weighting), the filter
  predicates, the usage-meter cap, the rate limiter that stands between a script and unlimited
  session creation and paid geocoding, and the session lifecycle. The web package has none:
  everything worth asserting was pushed down into `shared` and the Worker so it could be tested
  without a browser, which is why the split is lopsided.
- **Nothing in a test is allowed to race the clock.** The rate limiter's window test originally used
  `windowMs: 0` to reach the expiry path without waiting. The reset needs `now - start > windowMs`, so
  two calls inside the same millisecond do not reset it, and the test passed or failed on how fast the
  machine was - it did both, within one session. It waits out a real 5ms window now.

## Running locally

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
quota to stay inside the budget. `RESTAURANT_SOURCE` takes `google` or `mock`; anything else gets
the mock deck, silently, which is a real restaurant app serving fictional restaurants.

## Project layout

```
packages/
  shared/   # types, websocket protocol, Zod schemas, pure decision core (imported by both sides)
  worker/   # Cloudflare Worker (Hono) + SessionRoom Durable Object + D1/Drizzle
  web/      # React client (PWA)
docs/adr/   # architecture decision records
```

## Deploy

Runs entirely on Cloudflare's free tier (one Worker + Durable Objects + D1, serving the SPA too). See [DEPLOY.md](DEPLOY.md) for the step-by-step.

## Observability

- **Errors + requests:** Workers Logs is enabled (`[observability]` in `wrangler.toml`), so uncaught
  throws and handled errors (via `app.onError`) are captured. Tail live with
  `pnpm --filter @wherever/worker exec wrangler tail`.
- **Uptime:** `GET /api/health` returns a small JSON ok, ready for a free external monitor (e.g.
  UptimeRobot).

## License

[MIT](LICENSE) © Aiden Jang
