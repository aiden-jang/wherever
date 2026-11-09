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

Keep the dealt place IDs and reserve IDs in room storage. Live display data lives
in the active object. A resumed round sends its saved ballot and card order first.
The browser requests missing details for its current unvoted card as it advances.
The room shares in-flight lookups for the same place and uses the shared search budget. An
exhausted reserve widens the radius before a new search. Same-deck replay uses
the same IDs and respects places the group excluded.

Photo URLs point to `/api/photo`. The Worker validates photo references and keeps
the key server-side. It requests the photo when displayed and returns it without
caching the bytes. Location lookup also returns an uncached response. Usage
reservations are bounded by [ADR 0003](0003-usage-meter.md).

## Consequences

The interface keeps the provider out of voting and UI state. Pure normalization
and filter tests detect missing fields and sample/live inconsistencies.

Straight-line distance is a display estimate, not routing. Provider field masks
can change the billing tier, and quota/key setup remains external.
Live provider behavior is outside sample-backed browser verification.
