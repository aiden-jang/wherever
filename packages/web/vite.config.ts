import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/*
 * Where the app is served from, for the Open Graph tags in index.html.
 *
 * Not an .env file: those are gitignored here, so an unset variable would ship the literal
 * "%VITE_SITE_URL%" to every crawler, which is worse than the relative URL this replaced. A default
 * in committed code cannot go missing; SITE_URL still overrides it for a preview deploy.
 */
const siteUrl = (process.env.SITE_URL ?? "https://wherever.aidenjang.com").replace(/\/$/, "");

/** Vite only substitutes %VITE_*% from loaded env files, so do the replacement ourselves. */
const htmlSiteUrl = {
  name: "html-site-url",
  transformIndexHtml: (html: string) => html.replaceAll("%SITE_URL%", siteUrl),
};

export default defineConfig(({ mode }) => {
  /*
   * `API_PORT` from the shell or from `.env.local`, which is gitignored.
   *
   * It was shell-only, and the shell is the one place a launcher cannot reach: any harness that runs
   * `pnpm dev:web` for you has no way to pass it. A file is something you can leave lying around on a
   * machine where another Workers app already holds 8787.
   *
   * Read next to this file rather than from `process.cwd()`: a launcher runs `pnpm dev:web` from the
   * repo root, so the working directory is two levels up from the env file it is looking for.
   *
   * Dev only, so none of the argument above `siteUrl` applies - nothing here is substituted into a
   * build, and an unset value falls back to the same 8787 it always did.
   */
  const here = fileURLToPath(new URL(".", import.meta.url));
  const apiPort = process.env.API_PORT ?? loadEnv(mode, here, "").API_PORT ?? "8787";

  return {
    plugins: [react(), tailwindcss(), htmlSiteUrl],
    server: {
      // Honor the port the preview/launch harness assigns via PORT; fall back to
      // 5173 for plain `pnpm dev`.
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      proxy: {
        // In dev, the Worker runs under `wrangler dev` (default :8787). API_PORT moves it, which matters
        // when another Workers app on this machine already holds 8787.
        /* `127.0.0.1`, never `localhost`. Node resolves `localhost` to ::1 first and wrangler listens on
         IPv4 only, so the proxy gets ECONNREFUSED against a Worker that is plainly running. */
        "/api": `http://127.0.0.1:${apiPort}`,
        "/ws": { target: `ws://127.0.0.1:${apiPort}`, ws: true },
      },
    },
  };
});
