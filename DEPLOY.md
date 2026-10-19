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

`SEARCH_MONTHLY_CAP`, `PHOTO_MONTHLY_CAP`, and `GEOCODE_MONTHLY_CAP` each default to
950 monthly requests. Configuration can lower a cap, including zero to stop that
request kind, but cannot raise it above 950. Invalid values disable that kind.
The global usage meter commits each reservation atomically before contacting
Google, counts failed attempts, and refuses requests if the meter is unavailable.
Cache hits do not spend another reservation. Exhausted searches serve labeled
samples; exhausted photos and location lookups return 429 without calling Google.

Counters reset at midnight Pacific time on the first of the month, matching
[Google's free-usage reset](https://developers.google.com/maps/billing-and-pricing/overview).
Existing search/photo counts survive deployments. Older stored records gain a
geocoding counter without resetting those counts. The month is reported as YYYY-MM.

These limits cover this Worker's requests, not other uses of the same key or
billing account. Local development has a separate usage meter. Restrict the key
to the required APIs and set provider quotas as a second backstop. Billing alerts
do not stop requests. Keep billing enabled for real photos; a Demo Key cannot
provide them even when the application has photo reservations remaining.

The production key is restricted to Places API (New) and Geocoding API. The
Worker calls Google server-side; website referrer restrictions do not apply, and
an IP allowlist requires stable outbound addresses that this deployment does not
provide. Keep the key secret; API restrictions do not bind it to this Worker.

Google's project quotas provide a stricter daily backstop: Nearby Search,
GetPhotoMedia, and Geocoding v3 are each limited to 30 requests per day. That
allows at most 930 requests of each kind in a 31-day month. Unused Places methods
and Geocoding v4 methods have daily quotas of zero. The daily limits can stop
live searches, photos, or location lookups before the application's monthly
counter reaches 950. Increasing a daily limit changes the free-usage protection.
Other projects added to the billing account can consume the same free allowances;
these settings are not a spending limit for the whole billing account.

Photo URLs are relative by default. `PUBLIC_API_BASE` is an optional alternate
photo origin; leave it empty for normal same-origin operation.

## Operations

Workers Logs is enabled. From the root:

```bash
pnpm --filter @wherever/worker exec wrangler tail
```

`GET /api/health` reports the configured source. `GET /api/usage` reports search,
photo, and geocoding reservations and caps. The daily scheduled handler prunes old D1 session rows
and visited records; room storage has its own Durable Object lifetime.

If starting a round reports that restaurants could not load, check Workers Logs
for `places_search_failed`. It records the HTTP status and Google rejection codes,
not credentials, locations, or raw provider messages. `BILLING_DISABLED`,
`SERVICE_DISABLED`, and key-restriction errors need a provider configuration fix;
waiting or loosening dinner filters will not resolve them. A successful search
with no matching restaurants is a separate outcome. The health route checks the
Worker, not whether Google will accept a live search.

`restaurant_deck_failed` records the caught exception for a failed start or new
round, including failures outside the Google HTTP response. The room keeps its
retryable state and the exception stays out of the client message. A successful
direct test with a key does not confirm that the deployed Worker has the same
key configured or that the rest of its deck-loading path succeeds.

Follow [migration guidance](packages/worker/migrations/README.md) when changing the schema.
