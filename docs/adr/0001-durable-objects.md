# ADR 0001: Durable Objects for realtime sessions

Status: accepted

## Context

A group votes on one deck and needs an authoritative roster, tally, host, and
result. Reconnects must retain identity and votes. The realtime service should
support local integration tests and avoid an always-running application server.

## Decision

Address one `SessionRoom` Durable Object by session code. The room owns WebSockets
and persists live metadata, identity maps, votes, decks, and results in its
storage. Socket attachments support hibernation-safe presence.

`RoundController` handles voting and round transitions using the same storage;
`deckSource.ts` owns provider/reserve/history concerns. External provider awaits
can admit another event, so a transition guard spans fetch and persistence.
Pure shared logic ranks the result, while server handlers enforce permissions
and vote budgets.

D1 stores HTTP-created session records and visited history. One Worker serves the
built SPA and API; Vite proxies to it during local development.

## Consequences

The model gives each room one authority and supports stable reconnects, anonymous
projections, host grace, and a shared round deadline. Storage writes and transition
guards remain part of correctness; single-threaded JavaScript alone does not
make asynchronous handlers mutually exclusive.

The runtime and deployment are Cloudflare-specific. Integration tests use the
real Worker runtime and migrations. Pruning D1 does not remove Durable Object
storage, and physical-device behavior needs separate review.
