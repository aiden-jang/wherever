import { describe, expect, it } from "vitest";
import { ALL_MOOD_IDS, hourMood } from "./hourMood.js";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

describe("the background follows the clock", () => {
  it("has a mood for every hour of the day", () => {
    for (const h of HOURS) expect(hourMood(h).id, `${h}:00`).toBeTruthy();
  });

  it("uses every mood it defines", () => {
    // A mood no hour reaches is a palette nobody will ever see.
    const used = new Set(HOURS.map((h) => hourMood(h).id));
    expect([...used].sort()).toEqual([...ALL_MOOD_IDS].sort());
  });

  it("keeps the brand's own palette through the dinner window", () => {
    // 4pm to 7pm is the landing page's look and the hours this app exists for. Anything else here
    // means the app stops looking like itself exactly when it is being used.
    for (const h of [16, 17, 18]) {
      expect(hourMood(h).id, `${h}:00`).toBe("golden");
      expect(hourMood(h).from).toBe("#ff5e2c");
      expect(hourMood(h).via).toBe("#ff2d78");
      expect(hourMood(h).to).toBe("#7c3aed");
    }
  });

  it("goes cold in the small hours and warm in the evening", () => {
    expect(hourMood(2).id).toBe("small-hours");
    expect(hourMood(20).id).toBe("evening");
    expect(hourMood(23).id).toBe("late");
    expect(hourMood(0).id).toBe("late");
    expect(hourMood(8).id).toBe("morning");
  });

  it("never gets bright enough to eat text contrast", () => {
    // The aurora is a blurred wash behind every screen, including body copy.
    for (const h of HOURS) {
      const { opacity } = hourMood(h);
      expect(opacity, `${h}:00`).toBeGreaterThanOrEqual(0.3);
      expect(opacity, `${h}:00`).toBeLessThanOrEqual(0.55);
    }
  });

  it("writes every stop as a six-digit hex, because CSS gets these verbatim", () => {
    for (const h of HOURS) {
      const mood = hourMood(h);
      for (const stop of [mood.from, mood.via, mood.to]) {
        expect(stop, `${h}:00`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("gives each mood one unbroken stretch of the day", () => {
    // Counted around the clock, not along it: "late" runs 22:00 to 00:59, so a linear scan sees a
    // boundary at midnight that is not one. One run per mood means no palette flickers in and out.
    let boundaries = 0;
    for (let h = 0; h < 24; h += 1) {
      if (hourMood(h).id !== hourMood((h + 23) % 24).id) boundaries += 1;
    }
    expect(boundaries).toBe(ALL_MOOD_IDS.length);
  });

  it("survives a clock that hands back nonsense", () => {
    // Better a wrong-looking background than a blank one.
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(hourMood(bad).id).toBe("golden");
    }
    expect(hourMood(24).id).toBe(hourMood(0).id);
    expect(hourMood(-1).id).toBe(hourMood(23).id);
    expect(hourMood(17.9).id).toBe("golden");
  });
});
