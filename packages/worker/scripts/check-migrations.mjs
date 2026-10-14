import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const worker = fileURLToPath(new URL("../", import.meta.url));
const migrations = join(worker, "migrations");
const sqlFiles = readdirSync(migrations).filter((file) => file.endsWith(".sql"));
const journal = JSON.parse(readFileSync(join(migrations, "meta/_journal.json"), "utf8"));
const tags = journal.entries.map((entry) => entry.tag);
const missing = sqlFiles.filter((file) => !tags.includes(file.slice(0, -4)));
const orphaned = tags.filter((tag) => !sqlFiles.includes(`${tag}.sql`));
if (missing.length || orphaned.length) {
  console.error("Migration SQL and generation metadata disagree:", { missing, orphaned });
  process.exit(1);
}

mkdirSync(join(worker, ".wrangler"), { recursive: true });
const scratch = mkdtempSync(join(worker, ".wrangler/migration-check-"));
try {
  const output = join(scratch, "migrations");
  cpSync(migrations, output, { recursive: true });
  const config = join(scratch, "config.ts");
  writeFileSync(
    config,
    `import { defineConfig } from "drizzle-kit";\nexport default defineConfig(${JSON.stringify({
      dialect: "sqlite",
      driver: "d1-http",
      schema: "./src/db/schema.ts",
      out: relative(worker, output),
    })});\n`,
  );
  const result = spawnSync("pnpm", ["exec", "drizzle-kit", "generate", "--config", config], {
    cwd: worker,
    encoding: "utf8",
    timeout: 15_000,
  });
  const generated = readdirSync(output).filter((file) => file.endsWith(".sql"));
  if (
    result.error ||
    result.status !== 0 ||
    !result.stdout.includes("No schema changes, nothing to migrate") ||
    generated.length !== sqlFiles.length
  ) {
    console.error(result.error ?? "Schema changes must have committed SQL and metadata.");
    console.error(result.stdout, result.stderr);
    process.exitCode = 1;
  } else {
    console.log("migrations ok: SQL history, metadata, and current schema agree");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
