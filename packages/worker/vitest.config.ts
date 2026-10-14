import { join } from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside the real Workers runtime with the bindings from wrangler.toml (local in-memory
// D1 + the SessionRoom / RateLimiter Durable Objects). D1 needs a schema, so we read the app's
// migrations at config time and a setup file applies them to the isolated test database.
export default defineWorkersConfig(async () => {
  // Absolute, not "./migrations": knip loads this config from the repo root, and a relative path
  // resolves against the caller's directory rather than this one.
  const migrations = await readD1Migrations(join(import.meta.dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              // Handed to the setup file; not a real app binding.
              TEST_MIGRATIONS: migrations,
              // Keep tests hermetic and offline: use the mock deck, no live restaurant API calls.
              RESTAURANT_SOURCE: "mock",
              // The host-reassign grace, shrunk so the handover test runs in milliseconds.
              HOST_GRACE_MS: "50",
              GOOGLE_PLACES_API_KEY: "",
            },
          },
        },
      },
    },
  };
});
