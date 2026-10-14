# ADR 0003: Monthly search and photo reservations

Status: accepted

## Context

A shared live demo can trigger repeated provider calls. Alerts and a photo cache
do not impose an application-level ceiling on new search/photo requests.

## Decision

Use one global `UsageMeter` Durable Object with separate `search` and `photo`
counters for the UTC calendar month. Callers reserve before the provider request;
the reservation is counted even if that request fails. Deployment variables
configure the caps, and the counters reset when a new month is read.

A refused search reservation serves a seeded deck with a budget reason. Refused
photos use the interface's image fallback. Missing source configuration uses a
different sample reason. `/api/usage` exposes reservations and configured caps.

Geocoding is separate: it uses per-IP rate limits and an edge cache, without a
monthly reservation counter. Local development also has its own meter and can
consume real provider quota when live data is enabled.

## Consequences

The room remains playable when its search cap is reached, and the source of
sample data is visible. A global meter centralizes the reservation operation.

Call caps do not guarantee zero billing or cover other applications using the
provider project. Provider quotas, field-mask tiers, prices, cached-response
behavior, and project-wide usage must be considered independently. A calendar
month cap can be exhausted early; it is not a rolling rate limit.
