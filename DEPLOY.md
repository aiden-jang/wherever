# Deploying Wherever, Honestly

Everything runs on Cloudflare's free tier: the Worker + Durable Objects + D1 for the backend, and Pages for the web app. These steps need your own Cloudflare login, so run them yourself.

The API runs on the custom domain `api.wherever.aidenjang.com` and the web app on `wherever.aidenjang.com`.

## 1. Authenticate

```bash
cd packages/worker
npx wrangler login
```

## 2. Apply D1 migrations

The D1 database already exists and its `database_id` is committed in `packages/worker/wrangler.toml`, so there's nothing to create. Just apply the migrations to the remote database:

```bash
npx wrangler d1 migrations apply wherever --remote
```

(Only run `npx wrangler d1 create wherever` if you are standing up a brand-new database and need to replace the `database_id` in `wrangler.toml`.)

## 3. Deploy the Worker

```bash
pnpm --filter @wherever/worker run deploy
```

This also provisions the `api.wherever.aidenjang.com` custom domain declared in `wrangler.toml`.

## 4. Build + deploy the web app to Pages

The client reads the Worker origin from build-time env vars (it uses the Vite dev proxy when they are unset). Point them at the API's custom domain:

```bash
cd packages/web
VITE_API_BASE="https://api.wherever.aidenjang.com" \
VITE_WS_BASE="wss://api.wherever.aidenjang.com" \
pnpm build

npx wrangler pages deploy dist --project-name wherever
```

Or connect the repo in the Cloudflare Pages dashboard with build command `pnpm --filter @wherever/web build`, output dir `packages/web/dist`, and the two `VITE_*` vars set in the Pages environment.

## Restaurant data (Google Places)

The app ships on the seeded **mock** source, so it deploys and works with no API key. To go live with real places:

1. Add the source flag under `[vars]` in `packages/worker/wrangler.toml`:
   ```toml
   [vars]
   PUBLIC_API_BASE = "https://api.wherever.aidenjang.com"
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
