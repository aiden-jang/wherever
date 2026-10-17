// Check that verification and CI run the same real scripts with unambiguous command names.
import { globSync, readFileSync } from "node:fs";

/*
 * pnpm commands that are not script shortcuts. `test`, `start`, `stop` and `restart` are left out on
 * purpose: pnpm runs the script for those.
 */
const PNPM_OWN = new Set([
  "add",
  "audit",
  "bin",
  "config",
  "create",
  "deploy",
  "dlx",
  "docs",
  "env",
  "exec",
  "fetch",
  "import",
  "init",
  "install",
  "licenses",
  "link",
  "list",
  "ls",
  "outdated",
  "pack",
  "patch",
  "prune",
  "publish",
  "rebuild",
  "remove",
  "root",
  "run",
  "server",
  "setup",
  "store",
  "unlink",
  "update",
  "why",
]);

/* Neither installs anything nor gates anything: they are how a runner gets to the point of gating. */
const PLUMBING = new Set(["install", "exec", "dlx", "add"]);

const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
const workflows = globSync(".github/workflows/*.yml").map((f) => [f, readFileSync(f, "utf8")]);
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const problems = [];

const named = (text) => [...text.matchAll(/pnpm (?:--filter \S+ )?(run )?([a-z][\w:-]*)/g)];
const stepsIn = (text) =>
  named(text)
    .map((m) => m[2])
    .filter((n) => !PLUMBING.has(n));

/*
 * The deploy job is deliberately not compared. It builds again on the way out, and anything else it
 * grows is a release step rather than a gate.
 */
const deployAt = ci.indexOf("\n  deploy:");
const gateJobs = deployAt === -1 ? ci : ci.slice(0, deployAt);
const ciSequence = [...gateJobs.matchAll(/^\s*- run: (pnpm .+)$/gm)].flatMap((m) => stepsIn(m[1]));
const ciSteps = new Set(ciSequence);
const verifySequence = stepsIn(scripts.verify ?? "");
const verifySteps = new Set(verifySequence);
if (JSON.stringify(ciSequence) !== JSON.stringify(verifySequence))
  problems.push("CI and verify must run the same gates in the same order");

for (const name of verifySteps) {
  if (!scripts[name]) problems.push(`verify runs \`pnpm run ${name}\`, which is not a script`);
}
for (const [file, text] of workflows) {
  for (const name of stepsIn(text)) {
    if (!scripts[name]) problems.push(`${file} runs \`pnpm run ${name}\`, which is not a script`);
  }
}
for (const name of verifySteps) {
  if (!ciSteps.has(name)) problems.push(`verify runs \`${name}\` and ci.yml does not`);
}
for (const name of ciSteps) {
  if (!verifySteps.has(name)) problems.push(`ci.yml runs \`${name}\` and verify does not`);
}

// Scan fenced documentation commands, but scan complete executable scripts and workflows.
const fencedOnly = (markdown) => [...markdown.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]).join("\n");
const invocations = [
  ...Object.entries(scripts).map(([k, v]) => [`package.json ${k}`, v]),
  ...workflows,
  ...globSync("*.md").map((f) => [f, fencedOnly(readFileSync(f, "utf8"))]),
];
for (const [where, text] of invocations) {
  for (const [, run, name] of named(text)) {
    if (run || !PNPM_OWN.has(name) || !scripts[name]) continue;
    problems.push(
      `${where}: \`pnpm ${name}\` runs pnpm's own ${name}, not the script. Use \`pnpm run ${name}\`.`,
    );
  }
}

if (problems.length > 0) {
  console.error("gate check failed:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

console.log(`gates ok: verify and ci.yml run the same ${verifySteps.size} checks, none of them shadowed`);
