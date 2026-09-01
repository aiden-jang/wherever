# Deploying Wherever, Honestly

Everything runs on Cloudflare's free tier: the Worker + Durable Objects + D1 for the backend, and Pages for the web app.

**You do not normally need any of this.** Merging to `main` deploys both halves, and CI does it by running the same root script you would:

```bash
pnpm run deploy    # worker (migrations, then code), then build + publish web to Pages
```

Say `run`. Bare `pnpm deploy` is a pnpm builtin for packing a workspace package and will fail with `ERR_PNPM_INVALID_DEPLOY_TARGET`.

The steps below are the individual halves, for standing things up by hand. They need your own Cloudflare login, so run them yourself.

One Worker on `wherever.aidenjang.com` serves both the SPA and the API (`/api/*`, `/ws/:code`).
One origin means no CORS and one deploy. `api.wherever.aidenjang.com` still routes to the same
Worker so a page loaded before the merge keeps working; remove that route once nobody is on the
old bundle.

## 1. Authenticate

```bash
cd packages/worker
npx wrangler login
```

## 2. Apply D1 migrations

`pnpm run deploy` and the CI deploy both apply pending migrations before shipping code, so this is only needed when standing the database up by hand. The `database_id` is committed in `packages/worker/wrangler.toml`, so there is nothing to create:

```bash
npx wrangler d1 migrations apply wherever --remote
```

(Only run `npx wrangler d1 create wherever` if you are standing up a brand-new database and need to replace the `database_id` in `wrangler.toml`.)

## 3. Deploy the Worker

```bash
pnpm --filter @wherever/worker run deploy
```

This builds the SPA, applies pending D1 migrations, then deploys the Worker with the built
assets. It also provisions the custom domains declared in `wrangler.toml`.

**Deep links need no extra config.** `/s/CODE` and `/share` are SPA routes, not files, and
`not_found_handling = "single-page-application"` in `wrangler.toml` serves `index.html` for them.
Real files are matched first, so assets and icons are unaffected. This replaced a Pages
`_redirects` file, which only worked because the web app used to be a separate Pages project.

## Restaurant data (Google Places)

The app ships on the seeded **mock** source, so it deploys and works with no API key. To go live with real places:

1. Add the source flag under `[vars]` in `packages/worker/wrangler.toml`:
   ```toml
   [vars]
   RESTAURANT_SOURCE = "google"
   ```
2. Set the key as a Worker secret (never commit it):
   ```bash
   npx wrangler secret put GOOGLE_PLACES_API_KEY
   ```
3. Redeploy the Worker.

Restrict the key to the Places API and set a per-API usage quota to stay inside the budget. Place photos are proxied through the Worker's `/api/photo` route (keeps the key server-side, edge-caches the paid Place Photo SKU), which is why `PUBLIC_API_BASE` must match the API's custom domain. Foursquare remains available as an alternate source (`RESTAURANT_SOURCE=foursquare` + `FOURSQUARE_API_KEY`).

## Notes

- CORS on the Worker allows any origin, so the Pages site can call it cross-origin.
- Local dev is unaffected: with the `VITE_*` vars unset, the app talks to `localhost:8787` through the Vite proxy, and with `RESTAURANT_SOURCE`/key unset it uses the mock deck.
- Tail live logs with `npx wrangler tail`; browse them in the dashboard under Workers & Pages → the worker → Logs.
