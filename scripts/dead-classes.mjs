/*
 * Find class names the stylesheet never defines.
 *
 * There is a gap no other check covers: TypeScript does not read CSS, eslint does not read CSS, and
 * an undefined class is legal HTML that renders as nothing. It is the same silent-failure shape as
 * `var(--undeclared)`, which is why check-css-vars.mjs exists, except nothing here even has a
 * fallback to land on.
 *
 * The check needs the built CSS rather than index.css, because most classes here are Tailwind
 * utilities that only exist once Tailwind has seen them used. A token missing from the build output
 * is a token that produces no CSS anywhere. So it runs after the build, in verify and in CI.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB = "packages/web";
const DIST = join(WEB, "dist");

/*
 * The stylesheet index.html actually links, resolved from the href rather than guessed at. Picking
 * the first `.css` out of the output folder means auditing a stale file whenever a previous build's
 * assets are still sitting there, and reporting "no dead classes" about a build nobody runs.
 */
let href;
try {
  href = /<link[^>]+href=["']([^"']+\.css)["']/.exec(readFileSync(join(DIST, "index.html"), "utf8"))?.[1];
} catch {
  console.error("No dist/ found. Run the build first:\n  pnpm run build");
  process.exit(2);
}
if (!href) {
  console.error("dist/index.html links no stylesheet. Did the build finish?");
  process.exit(2);
}
const css = readFileSync(join(DIST, href.replace(/^\//, "")), "utf8");

// Selectors come out escaped (`.hover\:bg-card`, `.pb-\[1rem\]`); unescaping returns the source token.
const emitted = new Set();
for (const m of css.matchAll(/\.((?:\\.|[^\\\s.,:>~+()[\]{}'"#])+)/g)) {
  emitted.add(m[1].replace(/\\(.)/g, "$1"));
}

function sources(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) && !/\.test\./.test(entry) ? [path] : [];
  });
}

const used = new Map();
for (const file of sources(join(WEB, "src"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    // The literal text, plus every quoted string inside a ${...} — that is where the conditional
    // classes live. Operands of a comparison are skipped: `x === 'helpful'` is not a class list.
    const chunks = [raw.replace(/\$\{[^}]*\}/g, " ")];
    for (const lit of raw.matchAll(/(!==|===)?\s*'([^']*)'/g)) if (!lit[1]) chunks.push(lit[2]);
    for (const chunk of chunks) {
      for (const token of chunk.split(/\s+/)) {
        if (!token || token.includes("$") || token.includes("{")) continue;
        if (!used.has(token)) used.set(token, new Set());
        used.get(token).add(file.slice(WEB.length + 1));
      }
    }
  }
}

const dead = [...used].filter(([token]) => !emitted.has(token)).sort();
if (dead.length === 0) {
  console.log(`No dead classes. ${used.size} tokens used, all present in ${href}.`);
  process.exit(0);
}
console.error(`${dead.length} class name(s) produce no CSS:\n`);
for (const [token, files] of dead) console.error(`  ${token.padEnd(36)} ${[...files].sort().join(", ")}`);
process.exit(1);
