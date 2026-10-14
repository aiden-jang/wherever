# Design decisions

## One authority per room

`SessionRoom` owns identity, presence, message validation, and host handover.
`RoundController` uses the same Durable Object storage for round transitions,
votes, progress, and verdicts. `deckSource.ts` handles the provider, reserve,
search budget, and visited history. This separates responsibilities while keeping
one authoritative room and one wire protocol.

The provider can yield while fetching. An in-memory transition guard prevents
concurrent starts or replays until the full transition finishes; persisted state
still determines which operations are valid after hibernation.
See [ADR 0001](docs/adr/0001-durable-objects.md).

## A decision without unanimous agreement

The winner is the highest weighted positive score, with deck order breaking ties.
Passing is not a veto. Each person gets one weighted super-like and one veto that
removes a place outright. The server enforces these budgets and keeps vetoes
anonymous. Ranked backups let the host change an impractical result without
another search. A guest can wait for another round or leave from either result state.

## Providers behind one interface

`RestaurantSource` supplies normalized restaurants. Google normalization is separate
from HTTP transport, and sample data follows the same filters. Missing configuration
or a spent search cap yields labeled samples; an upstream failure remains retryable.
See [ADR 0002](docs/adr/0002-restaurant-source.md).

`UsageMeter` limits search and photo reservations. Geocoding has its own per-IP
limit and edge cache. These controls are not a guarantee of zero cost: provider
prices, project-wide usage, quotas, and live local development are separate concerns.
See [ADR 0003](docs/adr/0003-usage-meter.md).

## One origin and a network-dependent room

The Worker serves the built SPA, API, and sockets. Vite proxies to a local Worker
in development; browser verification uses production assets served by Wrangler.
The service worker caches an interface shell and static assets, never API/socket
responses. Opening a cached interface offline does not establish a live room.

## Room-scoped client state

The subscription reduces server messages into a coherent state. A code change
clears the previous room and command buffer; disposed/superseded sockets cannot
update it. Reconnects join with the stable client ID before buffered commands flush.

Location lookups preserve current non-location filters and cannot supersede a
new explicit neighborhood choice. Share and clipboard feedback belongs to the
surface that requested it; canceling a native share sheet does not copy instead.

## Interface choices

Voting stays one column on phones and uses the adjacent rail on desktop. Only the
active interactive card is mounted, so outgoing cards cannot retain gestures or
focus. Details and keyboard controls offer the same choices as dragging.

The winner is a dinner plan: ticket, tally, reasons, backups, directions, and a
share action. Motion, synthesized sound, haptics, and display effects respect their
supported browser APIs and the user's reduced-motion/sound choices.

Room announcements use seeded lines so re-renders do not change a sentence mid-read.
Dialogs trap visible controls, including WebKit's default button-skipping Tab
behavior, and restore focus to their trigger.
