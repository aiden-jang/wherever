import { describe, expect, it } from "vitest";
import {
  countFinished,
  decideWinner,
  tallyRightSwipes,
  tallyScores,
  tastePulse,
  vetoedRestaurantIds,
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
    reviewCount: null,
    distanceMeters: 100,
    imageUrl: null,
    address: null,
  };
}

function vote(participantId: string, restaurantId: string, dir: "left" | "right"): Vote {
  return { participantId, restaurantId, direction: dir };
}

function superVote(participantId: string, restaurantId: string): Vote {
  return { participantId, restaurantId, direction: "right", super: true };
}

const deck = [restaurant("a"), restaurant("b"), restaurant("c")];

describe("taste pulse", () => {
  it("stays hidden until enough anonymous group activity exists", () => {
    expect(tastePulse(deck, [
      vote("p1", "a", "right"),
      vote("p1", "b", "left"),
      vote("p1", "c", "right"),
      vote("p1", "a", "right"),
    ])).toBeNull();
    expect(tastePulse(deck, [vote("p1", "a", "right"), vote("p2", "a", "right")])).toBeNull();
  });

  it("summarizes openness, overlap, and price without naming a place or person", () => {
    const pricedDeck = deck.map((place, index) => ({ ...place, priceTier: (index + 1) as 1 | 2 | 3 }));
    expect(tastePulse(pricedDeck, [
      vote("p1", "a", "right"),
      vote("p1", "b", "left"),
      vote("p2", "a", "right"),
      vote("p2", "c", "right"),
    ])).toEqual({ rightRate: 75, activeVoters: 2, strongestOverlap: 2, averagePriceTier: 1.7 });
  });

  it("ignores votes for places outside the round", () => {
    expect(tastePulse(deck, [
      vote("p1", "ghost", "right"),
      vote("p1", "a", "right"),
      vote("p2", "a", "right"),
      vote("p2", "b", "left"),
      vote("p2", "c", "left"),
    ])?.rightRate).toBe(50);
  });
});

describe("super-like weighting", () => {
  it("tallyScores weights a super-like as 2 but tallyRightSwipes stays a headcount", () => {
    const votes = [vote("p1", "a", "right"), superVote("p2", "a")];
    expect(tallyScores(votes).get("a")).toBe(3); // 1 + 2
    expect(tallyRightSwipes(votes).get("a")).toBe(2); // two people
  });

  it("a super-like tips a race the headcount would tie", () => {
    // b has two normal rights; a has one normal + one super → a wins on weight (score 3 vs 2)...
    const votes = [
      vote("p1", "a", "right"),
      superVote("p2", "a"),
      vote("p3", "b", "right"),
      vote("p4", "b", "right"),
    ];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    // ...but the reported headcount is honest: 2 people wanted a, not 3.
    expect(result?.rightSwipes).toBe(2);
  });
});

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

describe("veto", () => {
  const yes = (participantId: string, restaurantId: string, sup = false): Vote => ({
    participantId,
    restaurantId,
    direction: "right",
    ...(sup ? { super: true } : {}),
  });
  const veto = (participantId: string, restaurantId: string): Vote => ({
    participantId,
    restaurantId,
    direction: "left",
    veto: true,
  });

  it("removes a place from contention no matter how many wanted it", () => {
    const votes = [yes("p1", "a"), yes("p2", "a"), yes("p3", "a"), veto("p4", "a"), yes("p1", "b")];
    // "a" has three right-swipes to "b"'s one, and still loses.
    expect(decideWinner(deck, votes)?.restaurant.id).toBe("b");
  });

  it("beats super-likes too, or it would not be a veto", () => {
    const votes = [yes("p1", "a", true), yes("p2", "a", true), veto("p3", "a"), yes("p1", "c")];
    expect(decideWinner(deck, votes)?.restaurant.id).toBe("c");
  });

  it("one veto is enough", () => {
    expect(vetoedRestaurantIds([veto("p1", "a")])).toEqual(new Set(["a"]));
  });

  it("leaves no winner when every wanted place was vetoed", () => {
    const votes = [yes("p1", "a"), veto("p2", "a"), yes("p1", "b"), veto("p3", "b")];
    expect(decideWinner(deck, votes)).toBeNull();
  });

  it("still counts as that person answering the card", () => {
    // Three-card deck: a veto plus two plain swipes means they are done, not stuck on two of three.
    const votes = [veto("p1", "a"), { participantId: "p1", restaurantId: "b", direction: "left" as const }, yes("p1", "c")];
    expect(countFinished(votes, ["p1"], deck.length)).toBe(1);
  });

  it("does not count toward the winner's headcount", () => {
    const votes = [yes("p1", "b"), yes("p2", "b"), veto("p3", "a")];
    expect(decideWinner(deck, votes)).toEqual({ restaurant: deck[1], rightSwipes: 2 });
  });
});
