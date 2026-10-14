# ADR 0002: Google Places behind a restaurant-source interface

Status: accepted

## Context

The deck needs nearby places, cuisine, prices, ratings, photos, and practical
restaurant details. Voting should not depend on a provider's response format.
Local work and verification should remain usable without live keys.

## Decision

Use Google Places Nearby Search through `RestaurantSource`. Normalize provider
records in `googlePlace.ts`, with source-independent filter predicates in
`restaurantSource.ts`. Google and the seeded sample source are the supported
implementations; unknown configuration serves labeled samples and logs a warning.

Cuisine/radius restrictions are sent upstream. Price, rating, reviews, open-now,
and amenities are enforced in the Worker before dealing. The sample source uses
the same applicable filters; its restaurant details are stand-ins.

Fetch one source result per new search, keep the dealt deck and a reserve in room
storage, and use reserve data before another call. Same-deck replay does not fetch.
An exhausted reserve widens the radius before a new search; failures preserve a
retryable state rather than claiming no restaurants exist.

Photo URLs point to `/api/photo`: validated references and snapped widths keep the
key server-side and make cache reuse practical. Search/photo reservations are
bounded by [ADR 0003](0003-usage-meter.md). Location search uses a separately
rate-limited and cached geocode route.

## Consequences

The interface keeps the provider out of voting and UI state. Pure normalization
and filter tests detect missing fields and sample/live inconsistencies.

Straight-line distance is a display estimate, not routing. Provider field masks
can change the billing tier, and quota/key setup remains external. Cache hits
reduce calls but do not guarantee each image is fetched only once globally.
Live provider behavior is outside sample-backed browser verification.
