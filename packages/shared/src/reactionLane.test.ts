import { describe, expect, it } from "vitest";
import { reactionLane } from "./reactionLane.js";

describe("where a reaction rises from", () => {
  it("gives the same person the same lane every time", () => {
    // The whole point: their reactions come from them, not from somewhere new each time.
    const first = reactionLane("Sam", "id-1");
    const second = reactionLane("Sam", "id-2");
    expect(first).toBe(second);
  });

  it("puts different people in different lanes", () => {
    const lanes = ["Sam", "Aiden", "Priya", "Tom"].map((n) => reactionLane(n, "x"));
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  it("ignores the whitespace a name picks up", () => {
    expect(reactionLane(" Sam ", "a")).toBe(reactionLane("Sam", "b"));
  });

  it("falls back to the id when there is no sender", () => {
    // System events carry no name on purpose, and two of them should not stack.
    expect(reactionLane("", "id-a")).not.toBe(reactionLane("", "id-b"));
  });

  it("stays inside the screen, well away from both edges", () => {
    const names = ["", "a", "Sam", "A very long display name indeed", "🙂", "Zzzzzzzzzz"];
    for (const n of names) {
      const lane = reactionLane(n, crypto.randomUUID());
      expect(lane, n).toBeGreaterThanOrEqual(20);
      expect(lane, n).toBeLessThanOrEqual(80);
    }
  });

  it("spreads a known group evenly rather than trusting the hash", () => {
    // Without the roster these two landed at 24% and 26% in a real session and overlapped.
    const roster = ["Aiden", "Priya"];
    const [a, b] = roster.map((n) => reactionLane(n, "x", roster));
    expect(Math.abs(a! - b!)).toBeGreaterThan(20);
  });

  it("keeps everyone on screen however big the group", () => {
    const roster = Array.from({ length: 9 }, (_, i) => `Person ${i}`);
    for (const n of roster) {
      const lane = reactionLane(n, "x", roster);
      expect(lane, n).toBeGreaterThanOrEqual(20);
      expect(lane, n).toBeLessThanOrEqual(80);
    }
  });

  it("still gives the same person the same lane as the group changes size", () => {
    // Seat order is stable, so a lane only moves when the roster itself does. That is fine; what
    // matters is that it never jumps between two reactions in the same breath.
    const roster = ["Aiden", "Priya"];
    expect(reactionLane("Priya", "a", roster)).toBe(reactionLane("Priya", "b", roster));
  });

  it("falls back to the hash for somebody not on the roster", () => {
    expect(reactionLane("Ghost", "x", ["Aiden"])).toBe(reactionLane("Ghost", "y", []));
  });

  it("does not collapse names that are anagrams of each other", () => {
    // A plain char-code sum gives "Sam" and "mas" the same lane; the position weight avoids that.
    expect(reactionLane("Sam", "x")).not.toBe(reactionLane("mas", "x"));
  });
});
