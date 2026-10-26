# October 26 interface and recovery review

Reviewed from base revision `f6a73f3` with the changes committed alongside this record.
The local preview used production assets and browser-only sample fixtures. No real
camera, precise location, live provider search, or production room was used.

## Scope and evidence

The capture tool reviewed landing, creation, joining, name entry, lobby, filters,
swiping, restaurant details, exhausted deck, winner, directions, no match, and
missing session. Additional fixtures cover unavailable creation/location search,
camera startup failure, blocked invite copying, and blocked dinner-plan sharing.
Each ran at widths 320, 390, 430, 768, and 1440, with reduced motion.

All captures passed automated WCAG A/AA checks, horizontal-overflow checks, and
page-error checks. Pixel inspection covered phone and desktop landing, narrow
creation and details, lobby filters, the narrow invite fallback, location and
camera errors, active voting, no match, and phone/desktop plan-sharing recovery.
The existing visual design was retained; the changes make failures recoverable.

Selected captures:

- [Desktop landing](landing-1440.png)
- [Location recovery on a phone](location-error-390.png)
- [Narrow invite-copy fallback](invite-error-320.png)
- [Camera fallback](qr-error-320.png)
- [Desktop plan-sharing fallback](winner-share-error-1440.png)

## Behavior and architecture

Regression tests first reproduced stale location results, false “not found”
provider errors, ignored creation cancellation, late scanner callbacks, duplicate
wake-lock requests, disappearing share failures, transition exceptions, private
navigation replacing the offline shell, and redundant immutable-asset fetching.
The changes restore retry, isolate resource ownership, and keep public caching
separate from room and API traffic. Worker tests distinguish provider rejection
from a successful zero-result search.

Server validation now has its own shared-package entry point. The production main
bundle measured 137.13 kilobytes gzip after separation, compared with 164.03
kilobytes in the updated-dependency build before separation. Dependency updates also remove the advisory findings reported
by the baseline audit. No assertions, gate ceilings, or timeouts were loosened.

## Limits

Fixtures establish layout and browser-side recovery; they do not establish live
provider behavior or billing configuration. The real local Worker journeys cover
room behavior separately. Chromium exercises actual service-worker installation,
cache boundaries, and offline reopening; that one journey is explicitly skipped
in WebKit because service-worker control is not established in this test setup.

This review does not claim physical iPhone/Android validation, native share-sheet
delivery, real camera decoding, spoken screen-reader output, or an observed visitor
study. Use the [visitor walkthrough](../../visitor-review.md) for that separate review.
