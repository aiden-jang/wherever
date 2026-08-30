import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiPort = process.env.API_PORT ?? "8787";

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

export default defineConfig({
  plugins: [react(), tailwindcss(), htmlSiteUrl],
  server: {
    // Honor the port the preview/launch harness assigns via PORT; fall back to
    // 5173 for plain `pnpm dev`.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      // In dev, the Worker runs under `wrangler dev` (default :8787). API_PORT moves it, which matters
      // when another Workers app on this machine already holds 8787.
      "/api": `http://localhost:${apiPort}`,
      "/ws": { target: `ws://localhost:${apiPort}`, ws: true },
    },
  },
});
