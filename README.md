# Wherever, Honestly

> Everyone swipes. Majority wins. Dinner is decided before the group chat even starts typing.

A group picks a restaurant by swiping, instead of sending 60 messages and eating cereal at 9pm. Join a session, swipe left or right on nearby spots, and the place with the most yeses wins. You can dislike something, but the group does not care about your feelings. That is the point.

## What it does

- **Swipe to vote.** Left or right on each restaurant. Arrow keys work on desktop; tap a card for a photo gallery, hours, price range, amenities, and a short blurb.
- **Group matching.** Everyone in a session votes on the same deck in real time.
- **Majority wins.** A left swipe is a downvote, not a veto. One picky person cannot tank dinner.
- **Super-like.** One weighted pick per round that can tip a close race, with a gold flash to the whole room.
- **Round timer (optional).** The host sets a countdown; when it's up, the votes so far decide — no more waiting on the slow one.
- **Filter like you mean it.** Cuisines to include *or* exclude, exact price levels, amenities (outdoor seating, veg-friendly, dog-friendly, takes-reservations…), rating/review floors, and one-tap presets ("Cheap & close", "Date night").
- **Show who's voted, or don't.** The host chooses; anonymous is the default and enforced server-side.
- **No accounts.** Type a name, share a code, done.
- **Remembers where you went.** Already-visited spots stop showing up.

> Part of a [platform of apps](https://github.com/aiden-jang/platform/blob/main/PLATFORM.md) that share one sign-in. Unlike the other apps (which serve their SPA
> from the Worker), wherever keeps its web and worker as **separate deploys**: the Worker is
> pure API + realtime, the web is a standalone PWA.

## How it works

The Worker (Hono) is pure API + realtime; the web is a standalone, installable PWA that talks to it
over HTTP and a WebSocket. Each session is owned by **one Durable Object** (`SessionRoom`) that is
the single authority for that session's live state: roster, the shared deck, and every vote. Durable
data (sessions, visited history) lives in Cloudflare D1 via Drizzle. Every HTTP and WebSocket payload
is validated with Zod at the boundary, so nothing untrusted reaches the game logic. It all runs on
free tiers.

Restaurants come from the Google Places API (New), reached through a swappable `RestaurantSource`
interface. Without an API key the app falls back to a seeded mock deck, so it is fully playable
offline and in CI, and Foursquare is kept as an alternate implementation.

## Decisions & trade-offs

**One Durable Object per session, as the single writer.** Realtime voting needs a single source of
truth for "who has voted on what" with no races. A Durable Object gives that natively: one isolate
owns one session, so votes serialize without a lock or an external store. The cost is that a session
lives in one isolate (not horizontally sharded), which is the right trade for group-sized rooms.
See [ADR 0001](docs/adr/0001-durable-objects.md).

**The decision is computed in a pure core, and made exactly once.** Whether the group has reached a
decision is a pure function of the votes, unit-tested in isolation from any I/O. Votes are
idempotent (re-sending the same vote is a no-op), and the "decided" transition fires exactly once
even if two final votes land in the same tick, so nobody sees a double-decide or a flicker between
outcomes.

**Majority, not consensus.** A left swipe is a downvote, not a veto. This is a product decision with
teeth: it means one holdout cannot stall the group, which is the entire reason the app exists.

**The data source is swappable behind an interface.** Google Places (New) is the default, but the
app is written against a `RestaurantSource` interface with a seeded mock and a Foursquare alternate.
That keeps the vendor at arm's length, keeps CI and offline dev fully playable with no key, and made
the provider a one-line switch. See [ADR 0002](docs/adr/0002-restaurant-source.md).

**Staying inside the free tier is enforced in code, not just hoped for.** A single global Durable
Object (`UsageMeter`) counts paid Google calls per calendar month. Before every Nearby Search and
every Place Photo fetch the Worker checks the budget; once the monthly cap is hit it stops calling
Google and serves a seeded sample deck ("demo mode") and photo fallbacks instead of billing. Photos
are proxied through the Worker and edge-cached, so each unique photo is paid for at most once. The
result: the live demo cannot run up a bill even if it goes viral, and it degrades to a fully-playable
demo rather than an error. See [ADR 0003](docs/adr/0003-usage-meter.md).

**Privacy is enforced on the wire, not in the UI.** "Show who's voted" is off by default, and when
it's off the server never sends per-voter identities at all — the field is omitted from the progress
payload, so it can't be recovered from devtools. Revealing is an explicit host opt-in. The only
thing that leaves the server is what the current mode permits.

**One Durable Object alarm, multiplexed.** A DO gets a single alarm, and two features need one: the
host hand-off grace window and the round countdown. Rather than fight over it, both write their
deadline to storage and a small scheduler sets the alarm to the earliest pending one; the handler
runs whichever elapsed (hand off host and/or decide the round) and reschedules the rest.

**Realtime resilience is handled, not hand-waved.** These edge cases decide whether a live app
feels solid or broken:

- **Reconnect.** A dropped client reconnects and the Worker replays full session state, so a flaky
  phone connection never desyncs the deck or loses your votes.
- **Host hand-off, with a grace window.** A refresh or a brief blip does *not* demote the host — a
  short grace timer means host only passes to another player if they're really gone, so the session
  never gets stuck with no one able to start or decide.
- **No leaks.** Stale sessions are pruned on a daily cron and bounded by a TTL, so abandoned rooms
  do not accumulate in D1.

## Testing

- **Pure decision core.** The "has the group decided" logic is unit-tested with no I/O, covering
  idempotent votes, decide-exactly-once, and majority edge cases.
- **Data-source adapter.** The `RestaurantSource` normalization and mock fallback are covered so a
  provider change or a bad upstream response cannot silently corrupt the deck.
- **Session lifecycle.** The full join / vote / decide / reconnect flow runs against the **real
  Workers runtime** via `@cloudflare/vitest-pool-workers`, with migrations applied to an in-memory
  D1 per file. 54 tests in all — 16 in `shared`, 38 in the Worker — covering the decision core
  (including super-like weighting), the filter predicates, the usage-meter cap, and the session
  lifecycle. The web package has none: everything worth asserting was pushed down into `shared` and
  the Worker so it could be tested without a browser, which is why the split is lopsided.

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
quota to stay inside the budget. To use Foursquare instead, set `RESTAURANT_SOURCE=foursquare` and
`FOURSQUARE_API_KEY`.

## Project layout

```
packages/
  shared/   # types, websocket protocol, Zod schemas, pure decision core (imported by both sides)
  worker/   # Cloudflare Worker (Hono) + SessionRoom Durable Object + D1/Drizzle
  web/      # React client (PWA)
docs/adr/   # architecture decision records
```

## Deploy

Runs entirely on Cloudflare's free tier (Worker + Durable Objects + D1, plus Pages for the web app). See [DEPLOY.md](DEPLOY.md) for the step-by-step.

## Observability

- **Errors + requests:** Workers Logs is enabled (`[observability]` in `wrangler.toml`), so uncaught
  throws and handled errors (via `app.onError`) are captured. Tail live with
  `pnpm --filter @wherever/worker exec wrangler tail`.
- **Uptime:** `GET /api/health` returns a small JSON ok, ready for a free external monitor (e.g.
  UptimeRobot).

## License

[MIT](LICENSE) © Aiden Jang
