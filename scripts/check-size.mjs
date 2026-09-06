/*
 * Ceilings on file length and component state, run by `pnpm run verify`.
 *
 * Nothing else here notices a file growing, and a god-file is never added in one go. It accretes
 * twenty lines at a time and no single diff looks wrong, which is how the match screen reached 1,243
 * lines and the lobby reached fifteen pieces of state.
 *
 * 400 matches the sibling apps. Lines are the proxy; the state count is the signal. Splitting the
 * file is almost always the right answer to a failure here.
 */
import { globSync, readFileSync } from "node:fs";

const MAX_LINES = 400;
const MAX_STATE = 12;

/*
 * Already over, and being decomposed. Listed at their size on the day the gate went in rather than
 * the ceiling being raised for everyone, so nothing else can grow past 400 meanwhile. Shrink an
 * entry as the file shrinks; delete it once the file is under the ceiling.
 */
const ALREADY_OVER = {
  "packages/web/src/components/MatchScreen.tsx": { lines: 920 },
  "packages/worker/src/sessionRoom.ts": { lines: 1000 },
  "packages/web/src/routes/Lobby.tsx": { lines: 573 },
  "packages/web/src/components/SwipeDeck.tsx": { lines: 763 },
  "packages/web/src/components/FilterFields.tsx": { lines: 614 },
  "packages/worker/src/restaurantSource.ts": { lines: 512 },
  "packages/web/src/routes/Landing.tsx": { lines: 448, state: 13 },
  // A hook, not a component, and the one place the state count says more than the line count: it is
  // the single subscription every screen reads, so every new server field lands here.
  "packages/web/src/useSessionSocket.ts": { state: 22 },
};

const files = globSync("packages/*/src/**/*.{ts,tsx}").filter((f) => !/\.test\.tsx?$/.test(f));
const problems = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  // Counted the way `wc -l` counts, so the number here is the number a person reads off the file.
  const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
  // useState in a component, not every hook: a count of these is how much one file keeps track of
  // at once.
  const state = (source.match(/\buseState[(<]/g) ?? []).length;
  const allowed = ALREADY_OVER[file] ?? {};
  const lineCap = allowed.lines ?? MAX_LINES;
  const stateCap = allowed.state ?? MAX_STATE;

  if (lines > lineCap) problems.push(`${file} is ${lines} lines, over ${lineCap}`);
  if (state > stateCap) problems.push(`${file} holds ${state} pieces of state, over ${stateCap}`);
  if (ALREADY_OVER[file]) {
    if (lines <= MAX_LINES && state <= MAX_STATE) {
      problems.push(`${file} is under the ceiling now: drop it from ALREADY_OVER`);
    } else {
      if (allowed.lines !== undefined && lines < allowed.lines) {
        problems.push(
          `${file} is down to ${lines} lines: lower its ALREADY_OVER entry from ${allowed.lines}`,
        );
      }
      if (allowed.state !== undefined && state < allowed.state) {
        problems.push(
          `${file} is down to ${state} state: lower its ALREADY_OVER entry from ${allowed.state}`,
        );
      }
    }
  }
}

for (const file of Object.keys(ALREADY_OVER)) {
  if (!files.includes(file)) problems.push(`${file} is listed as being decomposed but does not exist`);
}

if (problems.length > 0) {
  console.error("size check failed:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}

const decomposing = Object.keys(ALREADY_OVER).length;
console.log(
  `size ok: ceiling ${MAX_LINES} lines / ${MAX_STATE} state` +
    (decomposing > 0 ? `, with ${decomposing} file(s) still being decomposed` : ""),
);
