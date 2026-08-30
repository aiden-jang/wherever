import { describe, expect, it } from "vitest";
import { distanceLabel, distanceText, travelEstimate, travelLabel } from "./travel.js";

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

describe("the raw distance", () => {
  it("stays in one unit system", () => {
    // It used to say "750m" under a kilometre and "0.6 mi" over it, in an app that reads miles.
    for (const m of [30, 300, 900, 1500, 9000]) {
      expect(distanceLabel(m), `${m}m`).toMatch(/^(\d+ ft|\d+\.\d mi)$/);
    }
  });

  it("uses feet for the ones a tenth of a mile does not describe", () => {
    expect(distanceLabel(60)).toMatch(/ ft$/);
    expect(distanceLabel(400)).toMatch(/ mi$/);
  });

  it("never claims zero feet", () => {
    expect(distanceLabel(1)).toBe("50 ft");
  });

  it("grows with the distance", () => {
    const mi = (s: string | null) => Number(s!.replace(" mi", ""));
    expect(mi(distanceLabel(5000))).toBeGreaterThan(mi(distanceLabel(1000)));
  });

  it("says nothing rather than NaN when there is no distance", () => {
    // Every card that shows this asks for the travel estimate first, so this ran only on bad data.
    for (const bad of [0, -1, NaN, Infinity]) expect(distanceLabel(bad), String(bad)).toBeNull();
  });
});

describe("what the card shows for how far", () => {
  it("prefers the estimate people decide on", () => {
    expect(distanceText(5000)).toBe(travelLabel(5000));
  });

  it("falls back to nothing, not to a broken number", () => {
    for (const bad of [0, NaN, -5]) expect(distanceText(bad), String(bad)).toBeNull();
  });
});
