import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Honor the port the preview/launch harness assigns via PORT; fall back to
    // 5173 for plain `pnpm dev`.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      // In dev, the Worker runs under `wrangler dev` (default :8787).
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
