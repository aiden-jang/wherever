# ADR 0003: Monthly search and photo reservations

Status: accepted

## Context

A shared live demo can trigger repeated provider calls. Application-level
reservations bound those calls before the app contacts the provider.

## Decision

Use one global `UsageMeter` Durable Object with separate `search`, `photo`,
and `geocode` counters for the Pacific-time calendar month. Callers reserve before the provider request;
the reservation is counted even if that request fails. Deployment variables
configure the caps, and the counters reset when a new month is read.

A refused search reservation serves a seeded deck with a budget reason. Refused
photos use the interface's image fallback. Missing source configuration uses a
different sample reason. `/api/usage` exposes reservations and configured caps.

Geocoding also uses per-IP limits. Live detail lookups share the search counter.
Local development has its own meter and can consume provider quota when live
data is enabled.

## Consequences

The room remains playable when its search cap is reached, and the source of
sample data is visible. A global meter centralizes the reservation operation.

Call caps do not guarantee zero billing or cover other applications using the
provider project. Provider quotas, field-mask tiers, prices, and project-wide usage must be considered independently. A calendar
month cap can be exhausted early; it is not a rolling rate limit.
