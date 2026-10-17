import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Commit a production default so preview metadata never ships an unresolved environment placeholder.
const siteUrl = (process.env.SITE_URL ?? "https://wherever.aidenjang.com").replace(/\/$/, "");

/** Vite only substitutes %VITE_*% from loaded env files, so do the replacement ourselves. */
const htmlSiteUrl = {
  name: "html-site-url",
  transformIndexHtml: (html: string) => html.replaceAll("%SITE_URL%", siteUrl),
};

export default defineConfig(({ mode }) => {
  // Read dev API_PORT beside this config as well as from the shell; launchers may run from the repo root.
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
