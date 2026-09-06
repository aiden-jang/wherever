import { describe, expect, it } from "vitest";
import {
  cardsBehind,
  countFinished,
  decideNowWarning,
  nearMissLine,
  decideWinner,
  promoteAlternative,
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

describe("a near miss", () => {
  const alt = (id: string, n: number) => ({ restaurant: restaurant(id), rightSwipes: n });

  it("says who lost by one", () => {
    expect(nearMissLine("a", 3, [alt("b", 2)])).toBe("b lost by one.");
  });

  it("stays quiet about a comfortable win, which is not a story", () => {
    expect(nearMissLine("a", 5, [alt("b", 2)])).toBeNull();
  });

  it("stays quiet when there was no runner-up at all", () => {
    expect(nearMissLine("a", 3, [])).toBeNull();
    expect(nearMissLine("a", 3, undefined)).toBeNull();
  });

  it("leaves a dead tie to the tie line rather than claiming a margin", () => {
    // Level on headcount is `tiedWith`'s story; saying "lost by one" there would be wrong.
    expect(nearMissLine("a", 3, [alt("b", 3)])).toBeNull();
  });

  it("only reads the closest runner-up, not the rest of the field", () => {
    expect(nearMissLine("a", 3, [alt("b", 2), alt("c", 0)])).toBe("b lost by one.");
  });
});

describe("ending the round early", () => {
  it("counts the people it is about to decide for", () => {
    expect(decideNowWarning(1, 4)).toBe("3 people are still swiping. Their unvoted cards will not count.");
  });

  it("says person, not people, for one", () => {
    expect(decideNowWarning(3, 4)).toContain("1 person is still swiping");
  });

  it("says what actually happens to the votes nobody cast", () => {
    // The round decides on the votes so far; the rest are simply never counted.
    expect(decideNowWarning(1, 4)).toContain("will not count");
  });

  it("does not go negative if the counts disagree", () => {
    // finishedCount can briefly exceed the connected total when somebody drops mid-round.
    expect(decideNowWarning(5, 4)).toContain("0 people are");
  });
});

describe("how far behind somebody is", () => {
  it("is zero in a round nobody has started", () => {
    expect(cardsBehind([], "p1")).toBe(0);
  });

  it("is zero for the person who is furthest ahead", () => {
    const votes = [vote("p1", "a", "right"), vote("p1", "b", "left"), vote("p2", "a", "right")];
    expect(cardsBehind(votes, "p1")).toBe(0);
  });

  it("counts from the furthest-along person, not the average", () => {
    // Walking in on a group where one person has raced ahead should say six, not three.
    const votes = [
      vote("p1", "a", "right"),
      vote("p1", "b", "right"),
      vote("p1", "c", "right"),
      vote("p2", "a", "right"),
    ];
    expect(cardsBehind(votes, "p3")).toBe(3);
  });

  it("shrinks as the latecomer catches up", () => {
    const ahead = [vote("p1", "a", "right"), vote("p1", "b", "right")];
    expect(cardsBehind(ahead, "p2")).toBe(2);
    expect(cardsBehind([...ahead, vote("p2", "a", "right")], "p2")).toBe(1);
  });

  it("ignores your own votes when working out who is ahead", () => {
    const votes = [vote("p1", "a", "right"), vote("p1", "b", "right"), vote("p1", "c", "right")];
    expect(cardsBehind(votes, "p1")).toBe(0);
  });
});

describe("a tie", () => {
  it("is reported, not just quietly resolved by deck order", () => {
    const votes = [vote("p1", "a", "right"), vote("p2", "b", "right")];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.tiedWith).toBe(1);
  });

  it("counts every place level with the winner, not just the runner-up", () => {
    const votes = [vote("p1", "a", "right"), vote("p2", "b", "right"), vote("p3", "c", "right")];
    expect(decideWinner(deck, votes)?.tiedWith).toBe(2);
  });

  it("is zero when somebody actually won", () => {
    const votes = [vote("p1", "a", "right"), vote("p2", "a", "right"), vote("p3", "b", "right")];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.tiedWith).toBe(0);
  });

  it("ignores places nobody liked, which are all level on zero", () => {
    const votes = [vote("p1", "a", "right")];
    expect(decideWinner(deck, votes)?.tiedWith).toBe(0);
  });
});

describe("promoteAlternative", () => {
  it("makes a backup the winner and keeps the old winner as a reversible Plan B", () => {
    const result = {
      restaurant: deck[0]!,
      rightSwipes: 3,
      tiedWith: 0,
      vetoedTop: false,
      superTipped: false,
      alternatives: [
        { restaurant: deck[1]!, rightSwipes: 2 },
        { restaurant: deck[2]!, rightSwipes: 1 },
      ],
    };

    expect(promoteAlternative(result, "b")).toEqual({
      restaurant: deck[1],
      rightSwipes: 2,
      tiedWith: 0,
      vetoedTop: false,
      superTipped: false,
      alternatives: [
        { restaurant: deck[0], rightSwipes: 3 },
        { restaurant: deck[2], rightSwipes: 1 },
      ],
    });
  });

  it("refuses a restaurant that was not a ranked finalist", () => {
    expect(
      promoteAlternative(
        {
          restaurant: deck[0]!,
          rightSwipes: 2,
          tiedWith: 0,
          vetoedTop: false,
          superTipped: false,
          alternatives: [],
        },
        "ghost",
      ),
    ).toBeNull();
  });
});

describe("taste pulse", () => {
  it("stays hidden until enough anonymous group activity exists", () => {
    expect(
      tastePulse(deck, [
        vote("p1", "a", "right"),
        vote("p1", "b", "left"),
        vote("p1", "c", "right"),
        vote("p1", "a", "right"),
      ]),
    ).toBeNull();
    expect(tastePulse(deck, [vote("p1", "a", "right"), vote("p2", "a", "right")])).toBeNull();
  });

  it("summarizes openness, overlap, and price without naming a place or person", () => {
    const pricedDeck = deck.map((place, index) => ({ ...place, priceTier: (index + 1) as 1 | 2 | 3 }));
    expect(
      tastePulse(pricedDeck, [
        vote("p1", "a", "right"),
        vote("p1", "b", "left"),
        vote("p2", "a", "right"),
        vote("p2", "c", "right"),
      ]),
    ).toEqual({ rightRate: 75, activeVoters: 2, strongestOverlap: 2, averagePriceTier: 1.7 });
  });

  it("ignores votes for places outside the round", () => {
    expect(
      tastePulse(deck, [
        vote("p1", "ghost", "right"),
        vote("p1", "a", "right"),
        vote("p2", "a", "right"),
        vote("p2", "b", "left"),
        vote("p2", "c", "left"),
      ])?.rightRate,
    ).toBe(50);
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
    const counts = tallyRightSwipes([vote("p1", "a", "left"), vote("p2", "b", "left")]);
    expect(counts.size).toBe(0);
  });
});

describe("decideWinner", () => {
  it("returns null when there are no votes", () => {
    expect(decideWinner(deck, [])).toBeNull();
  });

  it("returns null when everyone swiped left on everything", () => {
    const votes = [vote("p1", "a", "left"), vote("p1", "b", "left"), vote("p2", "a", "left")];
    expect(decideWinner(deck, votes)).toBeNull();
  });

  it("picks the restaurant with the most right-swipes", () => {
    const votes = [vote("p1", "a", "right"), vote("p2", "a", "right"), vote("p3", "b", "right")];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.rightSwipes).toBe(2);
    expect(result?.alternatives?.map((choice) => choice.restaurant.id)).toEqual(["b"]);
  });

  it("keeps two ranked, non-vetoed backups", () => {
    const votes = [
      vote("p1", "a", "right"),
      vote("p2", "a", "right"),
      vote("p1", "b", "right"),
      vote("p2", "c", "right"),
      { ...vote("p3", "b", "left"), veto: true },
    ];
    const result = decideWinner(deck, votes);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.alternatives).toEqual([{ restaurant: deck[2], rightSwipes: 1 }]);
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
    const votes = [vote("p1", "b", "right"), vote("p2", "c", "right")];
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
    const votes = [vote("p1", "a", "right"), vote("p1", "b", "left"), vote("p1", "c", "right")];
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
    const votes = [
      veto("p1", "a"),
      { participantId: "p1", restaurantId: "b", direction: "left" as const },
      yes("p1", "c"),
    ];
    expect(countFinished(votes, ["p1"], deck.length)).toBe(1);
  });

  it("does not count toward the winner's headcount", () => {
    const votes = [yes("p1", "b"), yes("p2", "b"), veto("p3", "a")];
    expect(decideWinner(deck, votes)).toEqual({
      restaurant: deck[1],
      rightSwipes: 2,
      alternatives: [],
      tiedWith: 0,
      vetoedTop: false,
      superTipped: false,
    });
  });
});

describe("when a veto took the group's favourite", () => {
  const place = (id: string): Restaurant => ({ id, name: id }) as Restaurant;
  const deck = [place("a"), place("b")];
  const like = (who: string, what: string): Vote => ({
    participantId: who,
    restaurantId: what,
    direction: "right",
  });
  const veto = (who: string, what: string): Vote => ({
    participantId: who,
    restaurantId: what,
    direction: "left",
    veto: true,
  });

  it("says so when a vetoed place outscored the winner", () => {
    // Three people wanted "a"; one person killed it. "b" wins on one vote and reads as a clean win.
    const result = decideWinner(deck, [
      like("p1", "a"),
      like("p2", "a"),
      like("p3", "a"),
      veto("p4", "a"),
      like("p1", "b"),
    ]);
    expect(result?.restaurant.id).toBe("b");
    expect(result?.vetoedTop).toBe(true);
  });

  it("stays quiet when the veto killed something nobody was winning with", () => {
    const result = decideWinner(deck, [like("p1", "b"), like("p2", "b"), veto("p3", "a")]);
    expect(result?.restaurant.id).toBe("b");
    expect(result?.vetoedTop).toBe(false);
  });

  it("stays quiet when the vetoed place was only level, not ahead", () => {
    // Joint favourite is not "the group's favourite", and saying so would overstate it.
    const result = decideWinner(deck, [like("p1", "a"), like("p2", "b"), veto("p3", "a")]);
    expect(result?.vetoedTop).toBe(false);
  });

  it("stays quiet when nobody vetoed anything", () => {
    expect(decideWinner(deck, [like("p1", "a")])?.vetoedTop).toBe(false);
  });

  it("does not name what was vetoed anywhere in the result", () => {
    // The flag exists so the veto can stay anonymous; leaking the place undoes that.
    const result = decideWinner(deck, [like("p1", "a"), like("p2", "a"), veto("p3", "a"), like("p1", "b")]);
    expect(JSON.stringify(result)).not.toContain('"a"');
  });
});

describe("when a super-like decided it", () => {
  it("is flagged, because the headcount on screen cannot show it", () => {
    // b takes two plain likes, a takes one super-like: a wins on weight and loses on headcount.
    const result = decideWinner(deck, [
      superVote("p1", "a"),
      vote("p2", "b", "right"),
      vote("p3", "b", "right"),
    ]);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.rightSwipes).toBe(1);
    expect(result?.superTipped).toBe(true);
  });

  it("is not flagged when the super-like backed the place that was winning anyway", () => {
    const result = decideWinner(deck, [superVote("p1", "a"), vote("p2", "a", "right")]);
    expect(result?.restaurant.id).toBe("a");
    expect(result?.superTipped).toBe(false);
  });

  it("is not flagged when nobody spent one", () => {
    const result = decideWinner(deck, [vote("p1", "b", "right"), vote("p2", "b", "right")]);
    expect(result?.superTipped).toBe(false);
  });
});
