// Pure decision logic for a session. No I/O, no transport: just data in, result
// out. This is the heart of the app and the part that must be provably correct,
// so it lives here and is exhaustively unit-tested (see decision.test.ts).

import type { Restaurant, SwipeDirection, TastePulse } from "./types.js";

export interface Vote {
  participantId: string;
  restaurantId: string;
  direction: SwipeDirection;
  /** A super-like: a right-swipe that counts extra toward winning (see SUPER_WEIGHT). */
  super?: boolean;
  /**
   * Kills the place outright, however many people wanted it.
   *
   * "I will not eat there" is a different sentence from "I'd rather not", and a group that cannot say
   * the first one ends up back in the group chat. Still a vote: the person has answered that card.
   */
  veto?: boolean;
}

/** A super-like counts this much toward picking the winner (a normal right-swipe counts 1). */
export const SUPER_WEIGHT = 2;

/**
 * How aligned the room feels, without a leaderboard. No restaurant, category, person or individual
 * vote leaves this function, so an anonymous round stays anonymous.
 */
export function tastePulse(deck: Restaurant[], votes: Vote[]): TastePulse | null {
  const restaurantById = new Map(deck.map((restaurant) => [restaurant.id, restaurant]));
  const valid = votes.filter((vote) => restaurantById.has(vote.restaurantId));
  // A couple of swipes is noise and, in a small room, can read like one person's live ballot.
  const activeVoters = new Set(valid.map((vote) => vote.participantId)).size;
  if (valid.length < 4 || activeVoters < 2) return null;

  const right = valid.filter((vote) => vote.direction === "right");
  const supporters = new Map<string, Set<string>>();
  for (const vote of right) {
    const people = supporters.get(vote.restaurantId) ?? new Set<string>();
    people.add(vote.participantId);
    supporters.set(vote.restaurantId, people);
  }
  const priceTotal = right.reduce(
    (sum, vote) => sum + (restaurantById.get(vote.restaurantId)?.priceTier ?? 0),
    0,
  );

  return {
    rightRate: Math.round((right.length / valid.length) * 100),
    activeVoters,
    strongestOverlap: Math.max(0, ...[...supporters.values()].map((people) => people.size)),
    averagePriceTier: right.length > 0 ? Math.round((priceTotal / right.length) * 10) / 10 : null,
  };
}

export interface DecisionResult {
  restaurant: Restaurant;
  rightSwipes: number;
  /** The next two non-vetoed choices by the same tally, ready when the winner is impractical. */
  alternatives?: DecisionAlternative[];
  /**
   * How many places tied with the winner. Zero for a clean win.
   *
   * The tie is broken by deck order, which every client agrees on. Say it out loud: "we drew" is the
   * most interesting thing a vote can do, and without this nobody is ever told it happened.
   */
  tiedWith: number;
  /**
   * True when a vetoed place beat the winner: the group's actual favourite was killed.
   *
   * Vetoed places are dropped before ranking, silently, so without this a group agrees on somewhere,
   * loses it, and is handed second place with no sign the vote went any other way.
   *
   * A flag and not a name, on purpose. The veto is anonymous, and naming what it killed narrows the
   * vetoer down to one person in a group of four.
   */
  vetoedTop: boolean;
}

export interface DecisionAlternative {
  restaurant: Restaurant;
  rightSwipes: number;
}

/** Promote one ranked backup without throwing away the group's original tally. */
export function promoteAlternative(result: DecisionResult, restaurantId: string): DecisionResult | null {
  const alternatives = result.alternatives ?? [];
  const promoted = alternatives.find((choice) => choice.restaurant.id === restaurantId);
  if (!promoted) return null;

  return {
    // A promoted backup was chosen by hand, so whatever the original vote tied on no longer applies,
    // and neither does what a veto did to it: the host has overridden the vote either way.
    tiedWith: 0,
    vetoedTop: false,
    restaurant: promoted.restaurant,
    rightSwipes: promoted.rightSwipes,
    alternatives: [
      { restaurant: result.restaurant, rightSwipes: result.rightSwipes },
      ...alternatives.filter((choice) => choice.restaurant.id !== restaurantId),
    ].slice(0, 2),
  };
}

/** One per person per restaurant; the caller has already deduped. */
export function tallyRightSwipes(votes: Vote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of votes) {
    if (v.direction !== "right") continue;
    counts.set(v.restaurantId, (counts.get(v.restaurantId) ?? 0) + 1);
  }
  return counts;
}

/**
 * What picks the winner: a super-like is worth `SUPER_WEIGHT`, a plain right-swipe 1.
 *
 * Kept apart from `tallyRightSwipes` so the number on screen stays an honest headcount - "3 of 5
 * wanted it" - while a super-like can still tip a close race.
 */
export function tallyScores(votes: Vote[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const v of votes) {
    if (v.direction !== "right") continue;
    scores.set(v.restaurantId, (scores.get(v.restaurantId) ?? 0) + (v.super ? SUPER_WEIGHT : 1));
  }
  return scores;
}

/**
 * Restaurants somebody vetoed. One is enough — that is what makes it a veto rather than a vote.
 */
export function vetoedRestaurantIds(votes: Vote[]): Set<string> {
  const out = new Set<string>();
  for (const v of votes) {
    if (v.veto) out.add(v.restaurantId);
  }
  return out;
}

/**
 * Majority wins, ties broken by deck order so every client lands on the same answer. Null when
 * nobody swiped right, or when everything that got a right-swipe was also vetoed.
 *
 * A plain left swipe is only a downvote. A veto is absolute and beats any number of right-swipes,
 * super-likes included: one a big enough majority could overrule would not be a veto.
 */
export function decideWinner(deck: Restaurant[], votes: Vote[]): DecisionResult | null {
  const scores = tallyScores(votes); // weighted — decides the winner
  const counts = tallyRightSwipes(votes); // unweighted — the headcount we display
  const vetoed = vetoedRestaurantIds(votes);
  // Array.sort is stable: equal scores keep deck order, preserving the original deterministic
  // tie-break while also giving us the group's next-best choices from the very same decision.
  const scoreOf = (restaurant: Restaurant) => scores.get(restaurant.id) ?? 0;
  const ranked = deck
    .map((restaurant) => ({
      restaurant,
      score: scores.get(restaurant.id) ?? 0,
      rightSwipes: counts.get(restaurant.id) ?? 0,
    }))
    .filter((candidate) => candidate.score > 0 && !vetoed.has(candidate.restaurant.id))
    .sort((a, b) => b.score - a.score);
  const [winner, ...rest] = ranked;
  if (!winner) return null;
  // Strictly ahead, not level: a vetoed place tied with the winner was not the group's favourite,
  // it was joint favourite, and "your top pick was vetoed" would be overstating it.
  const bestVetoed = Math.max(0, ...deck.filter((r) => vetoed.has(r.id)).map(scoreOf));
  return {
    restaurant: winner.restaurant,
    rightSwipes: winner.rightSwipes,
    alternatives: rest.slice(0, 2).map(({ restaurant, rightSwipes }) => ({ restaurant, rightSwipes })),
    tiedWith: rest.filter((candidate) => candidate.score === winner.score).length,
    vetoedTop: bestVetoed > winner.score,
  };
}

/**
 * How close the runner-up came, when it came close. Null when it was not: "won by six" is not a story.
 *
 * Without it, "1 of 2 picked it" reads the same whether the group agreed or one swipe decided the
 * night. Counted in right-swipes - the headcount people can check against each other - rather than
 * the weighted score a super-like inflates.
 */
export function nearMissLine(
  winnerName: string,
  winnerRightSwipes: number,
  alternatives: DecisionAlternative[] | undefined,
): string | null {
  const runnerUp = alternatives?.[0];
  if (!runnerUp) return null;
  const margin = winnerRightSwipes - runnerUp.rightSwipes;
  if (margin < 1 || margin > 1) return null;
  return `${runnerUp.restaurant.name} lost by one.`;
}

/**
 * What ending the round early does, spelled out for the host about to do it. It is the one control
 * that acts on everybody else's behalf, and as a bare underlined link it read like a shortcut rather
 * than what it is: the unfinished cards simply never count.
 */
export function decideNowWarning(finishedCount: number, totalParticipants: number): string {
  const waiting = Math.max(0, totalParticipants - finishedCount);
  const who = waiting === 1 ? "1 person is" : `${waiting} people are`;
  return `${who} still swiping. Their unvoted cards will not count.`;
}

/**
 * How far ahead the furthest-along person is. Zero when you are level or leading.
 *
 * Somebody opening the link mid-round otherwise lands in a deck with no sign voting started without
 * them, while the group watches "3 of 4 done" become "3 of 5" for no visible reason. Counted from
 * votes, not arrival time, so a reconnect that missed a stretch gets the same honest answer.
 */
export function cardsBehind(votes: Vote[], participantId: string): number {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.participantId, (counts.get(v.participantId) ?? 0) + 1);
  const mine = counts.get(participantId) ?? 0;
  let furthest = 0;
  for (const [id, n] of counts) if (id !== participantId && n > furthest) furthest = n;
  return Math.max(0, furthest - mine);
}

/**
 * Which of the given participants have cast a vote on every deck item (i.e. finished the round).
 * Order follows participantIds. Used both to decide when the round is over and, when the host opted
 * to reveal it, to show who's already done.
 */
export function finishedParticipantIds(votes: Vote[], participantIds: string[], deckSize: number): string[] {
  if (deckSize === 0) return [];
  const votedByParticipant = new Map<string, Set<string>>();
  for (const v of votes) {
    let set = votedByParticipant.get(v.participantId);
    if (!set) {
      set = new Set();
      votedByParticipant.set(v.participantId, set);
    }
    set.add(v.restaurantId);
  }
  return participantIds.filter((pid) => (votedByParticipant.get(pid)?.size ?? 0) >= deckSize);
}

/**
 * How many of the given participants have cast a vote on every deck item.
 * Used to decide when the round is over.
 */
export function countFinished(votes: Vote[], participantIds: string[], deckSize: number): number {
  return finishedParticipantIds(votes, participantIds, deckSize).length;
}
