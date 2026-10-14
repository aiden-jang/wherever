import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "wherever-docs-check-"));
const checker = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));
mkdirSync(join(root, "packages/worker/migrations"), { recursive: true });
mkdirSync(join(root, "packages/example/src"), { recursive: true });
mkdirSync(join(root, ".github"));
for (const file of [
  "README.md",
  "DEPLOY.md",
  "DECISIONS.md",
  "CONVENTIONS.md",
  "CONTRIBUTING.md",
  "packages/worker/migrations/README.md",
]) {
  writeFileSync(join(root, file), "");
}
writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }));
writeFileSync(join(root, "packages/example/src/example.ts"), "export const validSymbol = 1;\n");
after(() => rmSync(root, { recursive: true, force: true }));

function check(readme, policy = "") {
  writeFileSync(join(root, "README.md"), readme);
  writeFileSync(join(root, ".github/SECURITY.md"), policy);
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8", timeout: 2_000 });
}

test("a documented symbol resolves against source", () => {
  const result = check("Use validSymbol.\n");
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("a missing symbol still fails documentation verification", () => {
  const result = check("Use missingSymbol.\n");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /nothing named `missingSymbol`/);
});

test("GitHub policy documentation is checked too", () => {
  const result = check("", "Use missingPolicySymbol.\n");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /\.github\/SECURITY\.md:1: nothing named `missingPolicySymbol`/);
});

test("an almost-matching identifier cannot stall the docs checker", () => {
  // A word-character suffix prevents the final word boundary after many uppercase groups.
  const result = check(`a${"Ab".repeat(28)}_\n`);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
