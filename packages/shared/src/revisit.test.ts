import { describe, expect, it } from "vitest";
import type { VisitedPlace } from "./types.js";
import { blockedIds, daysSince, REVISIT_AFTER_DAYS, revisitNote } from "./revisit.js";

/*
 * The bug this fixes was a tombstone dressed as a cooldown: `visitedAt` was recorded from the first
 * commit and never read, so every place the group picked left the deck for good.
 */

const NOW = new Date("2026-08-12T12:00:00Z");
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const been = (id: string, days: number, neverAgain = false): VisitedPlace => ({
  restaurantId: id,
  name: id,
  visitedAt: daysAgo(days),
  neverAgain,
});

describe("what stays out of the deck", () => {
  it("keeps somewhere the group just went", () => {
    expect(blockedIds([been("a", 3)], NOW).has("a")).toBe(true);
  });

  it("lets it back once the cooldown is up", () => {
    // The whole point: a group that uses this app should not run out of restaurants.
    expect(blockedIds([been("a", REVISIT_AFTER_DAYS + 1)], NOW).has("a")).toBe(false);
  });

  it("treats the boundary as still out, then in", () => {
    expect(blockedIds([been("a", REVISIT_AFTER_DAYS - 1)], NOW).has("a")).toBe(true);
    expect(blockedIds([been("a", REVISIT_AFTER_DAYS)], NOW).has("a")).toBe(false);
  });

  /*
   * The distinction the app was missing.
   *
   * "We went last week" is about timing and expires. "Never again" is about the place and does not.
   * Collapsing them into one list is what made every visit permanent.
   */
  it("keeps a never-again out forever", () => {
    expect(blockedIds([been("a", 3650, true)], NOW).has("a")).toBe(true);
  });

  it("blocks nothing when the group has been nowhere", () => {
    expect(blockedIds([], NOW).size).toBe(0);
  });

  it("handles a mix without confusing them", () => {
    const blocked = blockedIds([been("recent", 5), been("old", 200), been("banned", 400, true)], NOW);
    expect([...blocked].sort()).toEqual(["banned", "recent"]);
  });

  it("does not hide a place forever because its timestamp is unreadable", () => {
    // A bad row should fail toward showing the restaurant, not toward silently shrinking the deck.
    const broken: VisitedPlace = { restaurantId: "a", name: "a", visitedAt: "not a date" };
    expect(blockedIds([broken], NOW).has("a")).toBe(false);
    expect(daysSince("not a date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("saying it has been here before", () => {
  it("says nothing about a place the group has never been", () => {
    expect(revisitNote([], "a", NOW)).toBeNull();
  });

  it("says nothing while it is still in cooldown, since it will not appear anyway", () => {
    expect(revisitNote([been("a", 10)], "a", NOW)).toBeNull();
  });

  it("remembers roughly when, once it is back", () => {
    expect(revisitNote([been("a", 100)], "a", NOW)).toBe("you came here about 3 months ago");
  });

  it("switches to years rather than counting to twenty months", () => {
    expect(revisitNote([been("a", 400)], "a", NOW)).toBe("you came here about a year ago");
    expect(revisitNote([been("a", 800)], "a", NOW)).toBe("you came here about 2 years ago");
  });

  it("stays quiet about a never-again", () => {
    // It is not coming back, so a fond note about it would be a strange thing to read.
    expect(revisitNote([been("a", 400, true)], "a", NOW)).toBeNull();
  });

  it("never counts days or implies a schedule", () => {
    const notes = [100, 200, 400, 800].map((days) => revisitNote([been("a", days)], "a", NOW)!);
    for (const note of notes) {
      expect(note, note).not.toMatch(/\bdays?\b|due|overdue|time to|you should/i);
    }
  });
});
