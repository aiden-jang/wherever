import { describe, expect, it } from "vitest";
import {
  THROW_DISTANCE,
  THROW_MIN_TRAVEL,
  THROW_VELOCITY,
  throwDistance,
  throwDuration,
  throwVerdict,
} from "./throw.js";

describe("did that count as a vote", () => {
  it("takes a slow drag past the line", () => {
    expect(throwVerdict(THROW_DISTANCE + 1, 0)).toBe("right");
    expect(throwVerdict(-(THROW_DISTANCE + 1), 0)).toBe("left");
  });

  it("takes a hard flick that never got that far", () => {
    // The whole point: this used to do nothing, and the card just sat there after you threw it.
    expect(throwVerdict(50, 900)).toBe("right");
    expect(throwVerdict(-50, -900)).toBe("left");
  });

  it("ignores a fast pointer that barely moved, which is a tap or a scroll", () => {
    expect(throwVerdict(THROW_MIN_TRAVEL - 1, 2000)).toBeNull();
    expect(throwVerdict(0, 4000)).toBeNull();
  });

  it("ignores a short slow drag, which is somebody changing their mind", () => {
    expect(throwVerdict(60, 100)).toBeNull();
    expect(throwVerdict(-60, -100)).toBeNull();
  });

  it("lets the flick decide direction when it disagrees with where the card ended up", () => {
    // Dragged left, then flicked back right and let go: the last thing they did wins.
    expect(throwVerdict(-60, 900)).toBe("right");
  });

  it("sits exactly on the thresholds rather than just past them", () => {
    expect(throwVerdict(THROW_DISTANCE, 0)).toBe("right");
    expect(throwVerdict(THROW_MIN_TRAVEL, THROW_VELOCITY)).toBe("right");
  });
});

describe("how the card leaves", () => {
  it("throws a hard flick further than a nudge", () => {
    expect(throwDistance(2000)).toBeGreaterThan(throwDistance(200));
  });

  it("always clears a wide screen", () => {
    for (const v of [0, 500, 1500, 8000]) expect(throwDistance(v)).toBeGreaterThanOrEqual(520);
  });

  it("gets a hard flick out of the way faster", () => {
    expect(throwDuration(2000)).toBeLessThan(throwDuration(200));
  });

  it("never takes so long it feels stuck, or so little it never animates", () => {
    for (const v of [0, 500, 1500, 8000]) {
      expect(throwDuration(v)).toBeGreaterThanOrEqual(0.16);
      expect(throwDuration(v)).toBeLessThanOrEqual(0.34);
    }
  });

  it("does not run away on an absurd velocity", () => {
    // Some browsers report huge values on a fast trackpad fling.
    expect(throwDistance(50_000)).toBe(throwDistance(3000));
  });
});
