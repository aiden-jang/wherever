import { applyD1Migrations, env } from "cloudflare:test";

// Apply the app's D1 migrations to the isolated in-memory test database before the suite runs.
// TEST_MIGRATIONS is injected by vitest.config.ts.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
