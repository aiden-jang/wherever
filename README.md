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

**One voice, in one file, with a test that it is heard.** The landing had a rotating set of deadpan
lines and nowhere else did, so the app opened funny and went quiet exactly where a group is bored:
dealing, waiting on the slow one, and a dead tie. Those lines live in `shared/lines.ts` keyed by
moment, seeded so a re-render never swaps a sentence mid-read, and a test walks the web source and
fails if any moment is no longer rendered anywhere. That is what stops it drifting back into a
landing-page-only sprinkle.

**The card answers the two questions people actually ask.** It showed "3.1 mi", which is not a unit
anybody argues in at dinner time, and said nothing about whether the place was open, even though
`openNow` was already fetched and sitting on the type. It now reads "21 min drive" and carries an
open or closed marker, and the screen-reader description says the same. The estimate is honest about
being one: straight-line distance with the usual correction for a city grid, no routing API, because
none is worth paying for to decide where six people eat.

**A reaction knows which person sent it, not just which name.** Lanes were keyed on display name, and
`indexOf` returns the first match, so two people called Sam shared one. The app already identifies
people by a stable id everywhere else for exactly this reason; the reaction channel now does too.

**The button says "Deal the cards", so they get dealt.** They used to simply exist. The three visible
cards now arrive staggered 90ms apart with a short riffle from the same synth as the votes. It runs
once per deck, on a timed window rather than on mount, because the background cards are keyed by
restaurant: a new one mounts on every swipe, and animating those would make the stack twitch on every
vote. Reduced motion skips it.

**A flick counts, and the card leaves like it was thrown.** A swipe was decided on distance alone, so
a fast flick that did not travel 110px did nothing: you threw the card and it sat there. On a phone
that is most of the gesture, because a quick flick covers less ground than a slow drag of the same
intent. Velocity now counts too, provided the card actually moved, so a hard short flick is a vote and
a fast tap still is not. The exit carries the throw as well: a hard flick clears the screen further
and faster, a nudge over the line barely gets out. Reduced motion still just fades.

**A one-vote win says so.** The tally and the runners-up were already computed for the Plan B list,
but the margin was never said, so "2 of 2 picked it" read the same whether the group agreed or whether
one swipe decided the night. When the runner-up came within a single vote the winner screen now names
it: "Din Tai Fung lost by one." Only at exactly one, because "won by six" is not a story, and never
alongside the tie line, which is its own. Counted in right-swipes, the headcount people can check
against each other, rather than the weighted score a super-like inflates.

**A reaction comes from a person.** Reactions already floated, but from a lane derived from the
reaction's own random id, and the sender's name was on the wire and never used — so the same person's
emoji appeared somewhere new every time and the whole thing read as weather. Each person now keeps one
lane for the round and their reactions carry their name. Lanes are spread across the roster rather
than hashed, because hashing put two people at 24% and 26% in a real session and they overlapped.
Anonymous system events have no sender, so they keep neither.

**Something on screen moves when somebody else does.** During a round every signal about the group
was near-static: the avatars sit there, and `finishedCount` only ticks when a whole deck is done,
which can be minutes apart. So the app's central promise, that everyone is voting on this together
right now, was invisible. `vote_progress` already fanned out on every swipe, so it now carries a
plain count of every vote cast, which moves each time anybody swipes and pulses when it lands. A
count and nothing else: it says nothing about who voted or on what, so it holds in an anonymous
session exactly as it does in a revealed one.

**The deck stops being a small card in a void.** On a laptop the swiping screen was a 384px card
centred in 1280px of empty gradient, with the group's avatars, progress and reactions stacked under
it and fighting for the vertical space this screen never has. From `lg` up they sit beside the deck
instead, which fills the empty half and buys back the height, so the card can finally be the size of
the thing the app is about. Below `lg` nothing changed: the phone layout still fits with the reaction
bar above the fold, which is the constraint that shaped this screen in the first place.

**A veto looks like a consequence, not a laughing face.** Both a veto and a super-like already fanned
out to the room, but they reused the floating-reaction channel, so the thing that removes a place for
everybody drifted up the screen exactly like somebody tapping 😂. They now land in the middle at twice
the size behind a tint of their own colour, and they are announced, because that overlay is
`aria-hidden` and both were silent for a screen reader. Neither names the place or the person: a veto
is a vote, and votes here are anonymous.

Closing that also closed a leak. The super-like broadcast carried the sender's display name while the
veto deliberately carried none. A super-like is a weighted vote, so "the server never sends per-voter
identities" has to hold on every channel, not just the progress payload. It sends no name now.

**Ending the round early asks first.** "just decide now" was a bare underlined link that decided
instantly. It is the one control that acts on everybody else's behalf, and it read like a shortcut
rather than what it is. It now takes two steps and says the consequence in between: "2 people are
still swiping. Their unvoted cards will not count." The confirm replaces the link in the same row,
because that screen cannot afford another line.

**Voting is no longer silent.** The card already had a full label, the arrow keys already worked, and
every other realtime moment already announced itself, so the one thing missing was the vote itself:
pressing a button swapped the card underneath with nothing said. It now announces what you did, what
is in front of you, and where you are: "Vetoed Ellen's Stardust Diner. It is out for everyone. Next,
LOS TACOS No.1. 4 of 19." Undo says so too, and the end of the deck says it is the end rather than
naming a card that is not there.

**Walking in mid-round says so.** Somebody who opens the link after voting has started was dropped
straight into a deck with no sign the round was under way, while the group watched "3 of 4 done"
become "3 of 5" for no visible reason. The deck they receive now carries how far ahead the
furthest-along person is, and they get one line: "They started without you, 3 cards in. Your votes
still count." Counted from votes rather than from arrival time, so a reconnect that missed a stretch
gets the same honest answer as a genuine latecomer, and it is only ever sent to the person it
describes.

**The install prompt waits until it has a reason.** Asking on arrival is the thing everybody hates,
and it is also the worst moment: nobody installs an app they have not used. So it appears once, on
the winner screen, after a round has actually decided something, saying the only true thing there is
to say ("next argument could take one tap"). No is remembered. It never appears in Safari, which does
not fire `beforeinstallprompt`, because walking somebody through a share-sheet menu they did not ask
for is worse than staying quiet.

**A vibe says what it did, and the server is the only one who can say it.** Picking "chaotic" quietly
rewrote the group's filters and then dealt a deck that looked like any other, so the choice read as
decoration. It now arrives as a toast when the cards do: "fancy: tightened the search to 4 km, raised
the rating floor to 4.4." The line is built in the Worker at the moment the vibe is applied, because
`applyVibe` overwrites the very filters it would be measured against and the client only ever sees the
after. The wording is derived from the vibe's own filters rather than written by hand, so a vibe whose
numbers change cannot end up described as something it no longer does. It also only reports a real
change: chaotic against wide-open defaults asks for the deck you were already getting, and says so.

**The background keeps the clock's hours, but not at dinner time.** The aurora behind every screen
takes its three stops from the local hour, so 8pm is deeper than 5pm and 2am goes cold. Two rules
keep it from being a gimmick. The 4pm-to-7pm window is the brand's exact orange-and-pink, because
prime time is the wrong hour to stop looking like yourself, and a test pins those hex values. And
opacity stays in a narrow band, because the aurora is a blurred wash behind body copy and anything
brighter starts eating contrast. Reduced motion gets the palette without the drift.

**A tie is reported, not quietly resolved.** Ties break on deck order, which every client agrees on,
so the winner is deterministic. Before, nobody was told it happened. `decideWinner` now returns
`tiedWith`, and the winner screen says how many finished level and that this one was dealt first.
The line is seeded from the winner's id, so every phone in the room shows the same sentence. What it
does not do is pretend to flip a coin, because the tie-break is not random and saying so would be a
lie.

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
  D1 per file. 127 tests in all, 77 in `shared` and 50 in the Worker, covering the decision core
  (including super-like weighting), the filter predicates, the usage-meter cap, and the session
  lifecycle. The web package has none: everything worth asserting was pushed down into `shared` and
  the Worker so it could be tested without a browser, which is why the split is lopsided.

## Talking about this

**The short version.** A group decides where to eat by swiping, majority wins, and nobody has to be
the one who picked. One Durable Object per session holds the live state over WebSockets.

**The shape.** You make a session and share a code. Everyone joins over a WebSocket into the same
Durable Object, which is the only thing that writes that session's state. Votes go in, tallies come
out, and when a majority clears, the object decides once and tells everyone. Restaurants come from
Google Places, cached per session so a room of eight is one upstream call rather than eight.

**The call I'd defend.** The Durable Object is the single writer. I could have put votes in D1 and
polled, but then two people swiping at the same moment race, and "decide exactly once" turns into a
transaction problem. With one object owning the room, the decision is just a function call in
memory. That's the reason to reach for Durable Objects at all: they turn a distributed consistency
problem into a single-threaded one.

**The bug worth telling.** Every restaurant the group picked got filtered out of future decks
forever. `visitedAt` was recorded from the first commit and never read, so what was meant as a
cooldown was really a tombstone, and a group that used the app slowly ate its own options. The fix
separated two things that had been conflated: "we went last week" is about timing and expires after
90 days, "never again" is about the place and doesn't. Nobody reported it, because it fails by the
app quietly getting worse.

**What breaks first.** Google Places quota. It's the only part that costs money and it's metered
per month, so past the ceiling the app serves a sample deck and says so instead of erroring. Sessions
themselves scale fine because each room is its own object and rooms don't talk to each other.

**What I'd change.** Filters are one shared set owned by the host, but a winning vibe vote overwrites
them at round start. Both behaviours are defensible and together they're confusing: the host can set
something and watch it get replaced. I'd make one of them clearly win and say so in the UI.

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
