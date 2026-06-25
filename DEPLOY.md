# Deploying Wherever, Honestly

Everything runs on Cloudflare's free tier: the Worker + Durable Objects + D1 for the backend, and Pages for the web app. These steps need your own Cloudflare login, so run them yourself.

## 1. Authenticate

```bash
cd packages/worker
npx wrangler login
```

## 2. Create the real D1 database

```bash
npx wrangler d1 create wherever
```

Copy the printed `database_id` into `packages/worker/wrangler.toml`, replacing `local-dev-placeholder`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "wherever"
database_id = "<paste-the-real-id-here>"
migrations_dir = "migrations"
```

Apply the migrations to the remote database:

```bash
npx wrangler d1 migrations apply wherever --remote
```

## 3. Deploy the Worker

```bash
pnpm --filter @wherever/worker deploy
```

Note the deployed URL, e.g. `https://wherever-honestly.<your-subdomain>.workers.dev`.

## 4. Build + deploy the web app to Pages

The client reads the Worker origin from build-time env vars (it uses the Vite dev proxy when they are unset). Point them at the Worker from step 3:

```bash
cd packages/web
VITE_API_BASE="https://wherever-honestly.<your-subdomain>.workers.dev" \
VITE_WS_BASE="wss://wherever-honestly.<your-subdomain>.workers.dev" \
pnpm build

npx wrangler pages deploy dist --project-name wherever-honestly
```

Or connect the repo in the Cloudflare Pages dashboard with build command `pnpm --filter @wherever/web build`, output dir `packages/web/dist`, and the two `VITE_*` vars set in the Pages environment.

## Notes

- CORS on the Worker already allows any origin, so the Pages site can call it cross-origin.
- Local dev is unaffected: with the `VITE_*` vars unset, the app talks to `localhost:8787` through the Vite proxy.
- Restaurant data is still the seeded mock. To go live with real places, set `RESTAURANT_SOURCE=foursquare` and `FOURSQUARE_API_KEY` as Worker secrets and add the Foursquare adapter in `restaurantSource.ts`.
