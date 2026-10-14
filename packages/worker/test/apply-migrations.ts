import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { beforeEach } from "vitest";

// Apply the app's D1 migrations to the isolated in-memory test database before the suite runs.
// TEST_MIGRATIONS is injected by vitest.config.ts.
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
