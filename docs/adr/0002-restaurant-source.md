# ADR 0002: Google Places (New) as the restaurant source

Status: accepted (Phase 1)

## Context

The deck a session swipes on has to come from real nearby restaurants with
enough metadata to filter and rank: cuisine, price, rating, and distance. Two
hard constraints shape the choice:

- **Budget:** the whole project stays under ~$5/month. Any paid API has to be
  usage-capped, not just budget-alerted.
- **Swappability:** the data provider should never leak into vote logic or the
  UI, so we can change it without a rewrite.

Candidates were Foursquare Places and Google Places API (New). Both cover the
needed fields. Google has broader, more accurate coverage and richer place
types; Foursquare has a simpler free tier.

## Decision

Use **Google Places API (New) `places:searchNearby`** as the default source,
behind a `RestaurantSource` interface (`fetchDeck(filters) -> Restaurant[]`).
`MockRestaurantSource` (seeded deck) is the fallback when no key is configured,
and `FoursquareRestaurantSource` stays as an alternate implementation selected
by `RESTAURANT_SOURCE`.

Cost is controlled deliberately, since Google billing budgets are only alerts,
not hard caps:

- A **per-API usage quota** on the key is the real ceiling.
- A **tight field mask** requests only what the deck renders. `rating` and
  `priceLevel` set the SKU tier; reviews and other Preferred fields are omitted.
- The deck is fetched **once per session** and cached in the `SessionRoom`, so a
  whole group swiping costs one search, not one per person.
- **Photos go through a Worker proxy.** Place Photos is a separate paid SKU and
  the raw media URL needs the API key, so `imageUrl` points at our own
  `/api/photo` route (validated ref, key server-side). The route edge-caches for
  30 days, so each photo hits the SKU at most once per width. The deck still
  renders fine without images when a place has none.

## Consequences

Good:

- Better coverage and place-type granularity than Foursquare; cuisine filters
  map to Google primary types and run server-side.
- The `RestaurantSource` seam means mock/Foursquare/Google are interchangeable
  and each mapping (`mapGooglePlace`, `mapFoursquarePlace`) is pure and
  unit-tested.
- Fail-soft: a non-OK response yields an empty deck ("nothing nearby") rather
  than crashing a round.

Costs / tradeoffs:

- Nearby Search (New) does not return distance, so we compute it from the search
  center with a haversine. Good enough for a "how far" label, not routing.
- Price and rating filters run client-side after the fetch (the API filters
  cuisine and radius). Fine at `maxResultCount: 20`.
- Cost safety depends on the quota being set on the key, which is an external
  console step, not something the code can enforce.
- The photo proxy adds a small always-on cost path: a cache miss is one Place
  Photo SKU call plus Worker egress. The 30-day edge cache keeps repeats free,
  but a fresh deck of unseen places still pays per first view.
