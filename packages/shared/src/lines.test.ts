import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_MOMENTS, line, linesFor, type Moment } from "./lines.js";

describe("the app's voice", () => {
  it("has more than one line for every moment, so nothing reads like a label", () => {
    for (const moment of ALL_MOMENTS) {
      expect(linesFor(moment).length, moment).toBeGreaterThan(1);
    }
  });

  it("gives the same seed the same line", () => {
    // A re-render must not swap the sentence somebody is halfway through.
    for (const moment of ALL_MOMENTS) {
      expect(line(moment, 7)).toBe(line(moment, 7));
    }
  });

  it("stays inside the list for any seed a clock or a counter can produce", () => {
    for (const moment of ALL_MOMENTS) {
      const options = linesFor(moment);
      for (const seed of [0, 1, 999, -4, Date.now(), Number.MAX_SAFE_INTEGER]) {
        expect(options, `${moment} @ ${seed}`).toContain(line(moment, seed));
      }
    }
  });

  it("never uses the word this app does not say", () => {
    // House rule. It shows up in every AI-written "casual" blurb and nowhere in this app.
    for (const moment of ALL_MOMENTS) {
      for (const text of linesFor(moment)) {
        expect(text.toLowerCase(), moment).not.toContain("nonchalant");
      }
    }
  });

  it("keeps every line short enough to read while hungry", () => {
    for (const moment of ALL_MOMENTS) {
      for (const text of linesFor(moment)) {
        expect(text.length, text).toBeLessThanOrEqual(72);
      }
    }
  });

  it("renders every moment somewhere in the app", () => {
    // A moment nobody reaches is copy that cannot be seen to be wrong, so it quietly rots. This is
    // what stops the module drifting back into a landing-page-only sprinkle.
    const web = fileURLToPath(new URL("../../web/src", import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(name) && !name.includes(".test.") ? [full] : [];
      });
    const code = walk(web)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const moment of ALL_MOMENTS) {
      expect(code, `line("${moment}") is never rendered`).toContain(`"${moment}"`);
    }
  });
});

describe("picking a line", () => {
  it("covers the whole list as the seed walks", () => {
    const seen = new Set<string>();
    const moment: Moment = "tie";
    for (let seed = 0; seed < linesFor(moment).length; seed += 1) seen.add(line(moment, seed));
    expect(seen.size).toBe(linesFor(moment).length);
  });
});
