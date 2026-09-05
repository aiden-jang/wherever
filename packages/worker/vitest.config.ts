import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside the real Workers runtime with the bindings from wrangler.toml (local in-memory
// D1 + the SessionRoom / RateLimiter Durable Objects). D1 needs a schema, so we read the app's
// migrations at config time and a setup file applies them to the isolated test database.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
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
              GOOGLE_PLACES_API_KEY: "",
              FOURSQUARE_API_KEY: "",
            },
          },
        },
      },
    },
  };
});
