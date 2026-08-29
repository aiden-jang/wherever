import { describe, expect, it } from "vitest";
import { swipeAnnouncement, undoAnnouncement, type SwipeAnnouncement } from "./swipeAnnouncement.js";

const base: SwipeAnnouncement = {
  direction: "right",
  isSuper: false,
  isVeto: false,
  name: "Joe's Pizza",
  next: "Los Tacos",
  position: 2,
  total: 19,
};

describe("what a vote says out loud", () => {
  it("confirms the vote, names what is next, and says where you are", () => {
    expect(swipeAnnouncement(base)).toBe("Liked Joe's Pizza. Next, Los Tacos. 2 of 19.");
  });

  it("tells a pass from a like", () => {
    expect(swipeAnnouncement({ ...base, direction: "left" })).toContain("Passed on Joe's Pizza");
  });

  it("says what a veto does, because it is the one that cannot be taken back by voting", () => {
    const said = swipeAnnouncement({ ...base, direction: "left", isVeto: true });
    expect(said).toContain("Vetoed Joe's Pizza");
    expect(said).toContain("out for everyone");
  });

  it("names a super-like as one", () => {
    expect(swipeAnnouncement({ ...base, isSuper: true })).toContain("Super-liked Joe's Pizza");
  });

  it("prefers the veto over the super when somehow both are set", () => {
    // A veto is the consequential half; hearing "super-liked" there would be actively wrong.
    expect(swipeAnnouncement({ ...base, isSuper: true, isVeto: true })).toContain("Vetoed");
  });

  it("says the deck is finished instead of naming a card that is not there", () => {
    const said = swipeAnnouncement({ ...base, next: null });
    expect(said).toBe("Liked Joe's Pizza. That is all of them. Waiting on everyone else.");
    expect(said).not.toContain("of 19");
  });

  it("says an undo out loud too", () => {
    expect(undoAnnouncement("Joe's Pizza", 1, 19)).toBe("Took that back. Joe's Pizza again. 1 of 19.");
  });

  it("always ends a sentence, so a screen reader pauses rather than running on", () => {
    const cases: SwipeAnnouncement[] = [
      base,
      { ...base, next: null },
      { ...base, isVeto: true },
      { ...base, isSuper: true },
    ];
    for (const c of cases) expect(swipeAnnouncement(c).endsWith(".")).toBe(true);
  });
});
