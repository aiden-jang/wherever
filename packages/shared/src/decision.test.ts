import { describe, expect, it } from "vitest";
import {
  countFinished,
  decideWinner,
  tallyRightSwipes,
  type Vote,
} from "./decision.js";
import type { Restaurant } from "./types.js";

function restaurant(id: string): Restaurant {
  return {
    id,
    name: id,
    category: "Test",
    priceTier: 1,
    rating: null,
    distanceMeters: 100,
    imageUrl: null,
    address: null,
  };
}

function vote(participantId: string, restaurantId: string, dir: "left" | "right"): Vote {
  return { participantId, restaurantId, direction: dir };
}

const deck = [restaurant("a"), restaurant("b"), restaurant("c")];

describe("tallyRightSwipes", () => {
  it("returns empty for no votes", () => {
    expect(tallyRightSwipes([]).size).toBe(0);
  });

  it("counts only right swipes", () => {
    const counts = tallyRightSwipes([
      vote("p1", "a", "right"),
      vote("p2", "a", "right"),
      vote("p3", "a", "left"),
    ]);
    expect(counts.get("a")).toBe(2);
  });

  it("ignores left swipes entirely", () => {
    const counts = tallyRightSwipes([
      vote("p1", "a", "left"),
      vote("p2", "b", "left"),
    ]);
    expect(counts.size).toBe(0);
  });
});

describe("decideWinner", () => {
  it("returns null when there are no votes", () => {
    expect(decideWinner(deck, [])).toBeNull();
  });

  it("returns null when everyone swiped left on everything", () => {
    const votes = [
      vote("p1", "a", "left"),
      vote("p1", "b", "left"),
      vote("p2", "a", "left"),
    ];
    expect(decideWinner(deck, votes)).toBeNull();
  });

  it("picks the restaurant with the most right-swipes", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p2", "a", "right"),
      vote("p3", "b", "right"),
    ];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.rightSwipes).toBe(2);
  });

  it("a single left swipe does not veto a popular choice", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p2", "a", "right"),
      vote("p3", "a", "left"), // the picky one
    ];
    expect(decideWinner(deck, votes)?.restaurant.id).toBe("a");
  });

  it("breaks ties by deck order (earlier card wins)", () => {
    const votes = [
      vote("p1", "b", "right"),
      vote("p2", "c", "right"),
    ];
    // b and c each have 1; b comes before c in the deck.
    expect(decideWinner(deck, votes)?.restaurant.id).toBe("b");
  });

  it("ignores votes for restaurants not in the deck", () => {
    const votes = [vote("p1", "ghost", "right")];
    expect(decideWinner(deck, votes)).toBeNull();
  });
});

describe("countFinished", () => {
  it("counts a participant who voted on every deck item", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p1", "b", "left"),
      vote("p1", "c", "right"),
    ];
    expect(countFinished(votes, ["p1"], 3)).toBe(1);
  });

  it("does not count a participant mid-deck", () => {
    const votes = [vote("p1", "a", "right"), vote("p1", "b", "left")];
    expect(countFinished(votes, ["p1"], 3)).toBe(0);
  });

  it("counts each participant independently", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p1", "b", "right"),
      vote("p1", "c", "right"),
      vote("p2", "a", "right"),
    ];
    expect(countFinished(votes, ["p1", "p2"], 3)).toBe(1);
  });

  it("ignores duplicate votes for the same restaurant", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p1", "a", "left"), // same restaurant, still one distinct
      vote("p1", "b", "right"),
    ];
    expect(countFinished(votes, ["p1"], 3)).toBe(0);
  });

  it("returns 0 for an empty deck", () => {
    expect(countFinished([], ["p1"], 0)).toBe(0);
  });
});
