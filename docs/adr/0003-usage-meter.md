# ADR 0003: In-app monthly usage cap (circuit breaker)

Status: accepted

## Context

[ADR 0002](0002-restaurant-source.md) controls Google Places cost with a tight
field mask, per-session deck caching, and an edge-cached photo proxy — but ends
on a real gap:

> Cost safety depends on the quota being set on the key, which is an external
> console step, not something the code can enforce.

Google Maps Platform moved to **per-SKU monthly free tiers** (≈1,000 free
Nearby Search and 1,000 free Place Photo calls/month), and its billing _budgets
are alerts, not hard caps_. A key with no per-API quota, or a quota set too
high, can bill real money if the app gets shared around. For a portfolio demo
that should cost **$0**, "please remember to set a console quota" is not good
enough — the app itself should refuse to spend past the free tier.

## Decision

Add a single global Durable Object, **`UsageMeter`** (`idFromName("global")`),
that counts paid Google calls per calendar month and acts as a circuit breaker.

- Two counters, `search` and `photo`, keyed to the current UTC month; they reset
  automatically when the month rolls over.
- Every paid path calls `tryConsume(kind)` **before** hitting Google:
  - Nearby Search — in `SessionRoom.fetchFreshDeck`, before the live search.
  - Place Photos — in the `/api/photo` route, only on a cache miss (cached
    photos are free and don't count).
- Caps default to **950/month** each (just under the 1,000 free tier, with
  headroom for a month-end burst), overridable via `wrangler` vars.
- Over budget, the app **degrades instead of erroring**: search falls back to the
  seeded sample deck (flagged `demo: "budget"`, which the client shows as "demo
  mode"), and photos fall back to the cuisine emoji. `GET /api/usage` exposes the
  live counts.

This covers every paid path because they all funnel through the Worker; there is
no other route to the key.

> **Amended.** `demo` carries a reason rather than a boolean. The sample deck is also what a
> misconfigured `RESTAURANT_SOURCE` gets, and the banner used to blame the budget for both - which is
> a false statement in an app whose whole discipline is not claiming more than it knows.

## Consequences

Good:

- The free tier is enforced **in code**, closing the gap ADR 0002 left open. The
  demo can't run up a bill even if it's shared widely — worst case it shows
  stand-in restaurants until the 1st.
- Graceful, on-brand degradation (a playable "demo mode") rather than a broken
  screen, reusing the existing mock deck and photo fallbacks.
- A single-writer DO makes the read-modify-write on the counters race-free, same
  as `SessionRoom` (see [ADR 0001](0001-durable-objects.md)).

Costs / tradeoffs:

- A global meter is a single instance all sessions touch. At this app's scale
  that's a non-issue; a very high-traffic version would sky it (shard by month or
  batch writes).
- Belt-and-suspenders, not a replacement: a Google Cloud per-API quota is still
  worth setting as a hardware-level backstop against bugs or any future code path
  that bypasses the meter.
- Caps are wall-clock monthly, not rolling; a burst late in the month can still
  exhaust the tier early. Acceptable for a demo, and the fallback is safe.
