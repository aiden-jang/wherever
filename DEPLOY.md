# Hosting and configuration

One Cloudflare Worker on `wherever.aidenjang.com` serves the SPA, API, and sockets.
There is no separate Pages deployment or cross-origin production API.

## Normal delivery

Merging to `main` starts CI. The complete check job, including browser journeys,
must succeed before the delivery job runs `pnpm run deploy:only`. The Worker
script builds web assets, applies pending remote D1 migrations, then ships code
and assets together. A failure stops the chain.

The repository secret `CLOUDFLARE_API_TOKEN` needs Workers Scripts and D1 permissions.
The configured custom domain and D1 binding live in `packages/worker/wrangler.toml`.
The asset fallback supports `/s/:code` and `/share` directly.

## Manual delivery

From the repository root, after authentication and browser setup:

```bash
pnpm run deploy
```

The root command runs full verification before invoking the same delivery script.
Use `run`; the bare package-manager command of that name has different behavior.
Remote migrations and delivery modify production and should be performed deliberately.

## Restaurant configuration

The committed Worker source flag selects Google; without a key it falls back to
sample restaurants. Local `.dev.vars.example` selects `mock` explicitly.
`RESTAURANT_SOURCE` accepts `google` or `mock`; unknown values log a warning and
serve labeled samples. Live searches require `GOOGLE_PLACES_API_KEY` as a Worker
secret. Location lookup also requires the provider's Geocoding API.

Standard keys require Places API (New) and a linked billing account. Maps Demo
Keys have separate no-billing access and feature limits, including no
user-submitted photos or reviews; missing billing alone does not diagnose a Demo
Key failure. Check the provider rejection before upgrading a project. See
[Demo Key capabilities](https://developers.google.com/maps/demo-key).
Keep API restrictions on the required services; website referrer restrictions do
not fit requests made by a server-side Worker.

`SEARCH_MONTHLY_CAP` and `PHOTO_MONTHLY_CAP` configure monthly search/photo
reservations. Geocoding is rate-limited and cached separately. Provider quotas and
billing settings should account for the actual requested fields, other consumers
of the key, and local development. A local usage meter is separate from production.

Photo URLs are relative by default. `PUBLIC_API_BASE` is an optional alternate
photo origin; leave it empty for normal same-origin operation.

## Operations

Workers Logs is enabled. From the root:

```bash
pnpm --filter @wherever/worker exec wrangler tail
```

`GET /api/health` reports the configured source. `GET /api/usage` reports search and
photo reservations and caps. The daily scheduled handler prunes old D1 session rows
and visited records; room storage has its own Durable Object lifetime.

If starting a round reports that restaurants could not load, check Workers Logs
for `places_search_failed`. It records the HTTP status and Google rejection codes,
not credentials, locations, or raw provider messages. `BILLING_DISABLED`,
`SERVICE_DISABLED`, and key-restriction errors need a provider configuration fix;
waiting or loosening dinner filters will not resolve them. A successful search
with no matching restaurants is a separate outcome. The health route checks the
Worker, not whether Google will accept a live search.

Follow [migration guidance](packages/worker/migrations/README.md) when changing the schema.
