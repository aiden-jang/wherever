import { describe, expect, it } from "vitest";
import { travelEstimate, travelLabel } from "./travel.js";

describe("how long it takes to get there", () => {
  it("walks you to somewhere close", () => {
    expect(travelEstimate(400)?.mode).toBe("walk");
    expect(travelLabel(400)).toMatch(/^\d+ min walk$/);
  });

  it("drives you to somewhere nobody is walking to", () => {
    expect(travelEstimate(5000)?.mode).toBe("drive");
    expect(travelLabel(5000)).toMatch(/^\d+ min drive$/);
  });

  it("takes longer the further it is", () => {
    const near = travelEstimate(300)!.minutes;
    const far = travelEstimate(1200)!.minutes;
    expect(far).toBeGreaterThan(near);
  });

  it("allows for streets not being straight", () => {
    // 1km straight-line at 78 m/min would be 13 minutes; the detour factor makes it longer.
    expect(travelEstimate(1000)!.minutes).toBeGreaterThan(13);
  });

  it("never says zero minutes for somewhere you still have to walk to", () => {
    expect(travelEstimate(5)!.minutes).toBeGreaterThanOrEqual(1);
  });

  it("says nothing rather than something wrong when there is no distance", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(travelEstimate(bad), String(bad)).toBeNull();
      expect(travelLabel(bad), String(bad)).toBeNull();
    }
  });

  it("gives a walk and a drive that a person would believe", () => {
    // Sanity, not precision: ten minutes' walk is roughly 800m, not 80m or 8km.
    const tenMinuteWalk = travelEstimate(600)!;
    expect(tenMinuteWalk.minutes).toBeGreaterThan(5);
    expect(tenMinuteWalk.minutes).toBeLessThan(15);
  });
});
