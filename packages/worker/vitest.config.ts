import { join } from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs tests inside the real Workers runtime with the bindings from wrangler.toml (local in-memory
// D1 + the SessionRoom / RateLimiter Durable Objects). D1 needs a schema, so we read the app's
// migrations at config time and a setup file applies them to the isolated test database.
export default defineConfig(async () => {
  // Absolute, not "./migrations": knip loads this config from the repo root, and a relative path
  // resolves against the caller's directory rather than this one.
  const migrations = await readD1Migrations(join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            // Handed to the setup file; not a real app binding.
            TEST_MIGRATIONS: migrations,
            // Keep tests hermetic and offline: use the mock deck, no live restaurant API calls.
            RESTAURANT_SOURCE: "mock",
            // The host-reassign grace, shrunk so the handover test runs in milliseconds.
            HOST_GRACE_MS: "50",
            SEARCH_MONTHLY_CAP: "5",
            PHOTO_MONTHLY_CAP: "3",
            GEOCODE_MONTHLY_CAP: "2",
            GOOGLE_PLACES_API_KEY: "",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      maxWorkers: 1,
    },
  };
});
