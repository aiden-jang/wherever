import { expect, it } from "vitest";
import { blockedIds, revisitNote } from "./revisit.js";

const picks = [
  { restaurantId: "a", name: "One", visitedAt: "2026-11-09T00:00:00Z" },
  { restaurantId: "b", name: "Two", visitedAt: "2026-11-09T00:00:00Z", neverAgain: true },
];

it("keeps past picks out of fresh decks for the life of the room", () => {
  expect([...blockedIds(picks)]).toEqual(["a", "b"]);
});

it("labels a previous pick during same-deck replay without implying a visit", () => {
  expect(revisitNote(picks, "a")).toBe("Picked earlier in this room");
  expect(revisitNote(picks, "b")).toBeNull();
  expect(revisitNote(picks, "c")).toBeNull();
});
