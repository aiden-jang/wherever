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
   * A veto: a left-swipe that removes the place from contention outright, however many people
   * wanted it. The mirror of a super-like, and the one thing majority rule can't express — "I will
   * not eat there" is a different statement from "I'd rather not", and a group that can't say it
   * ends up back in the group chat, which is the one thing this app is against.
   *
   * Still a vote, so the person counts as having answered that card.
   */
  veto?: boolean;
}

/** A super-like counts this much toward picking the winner (a normal right-swipe counts 1). */
export const SUPER_WEIGHT = 2;

/**
 * Anonymous round texture without a leaderboard. No restaurant id, category, participant id, or
 * individual vote leaves this function, so the group can feel alignment without seeing the winner.
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
}

export interface DecisionAlternative {
  restaurant: Restaurant;
  rightSwipes: number;
}

/** Promote one ranked backup without throwing away the group's original tally. */
export function promoteAlternative(
  result: DecisionResult,
  restaurantId: string,
): DecisionResult | null {
  const alternatives = result.alternatives ?? [];
  const promoted = alternatives.find(choice => choice.restaurant.id === restaurantId);
  if (!promoted) return null;

  return {
    restaurant: promoted.restaurant,
    rightSwipes: promoted.rightSwipes,
    alternatives: [
      { restaurant: result.restaurant, rightSwipes: result.rightSwipes },
      ...alternatives.filter(choice => choice.restaurant.id !== restaurantId),
    ].slice(0, 2),
  };
}

/**
 * Count right-swipes per restaurant. Votes are assumed already deduped per
 * (participant, restaurant) by the caller, so a participant contributes at most
 * one vote to any restaurant.
 */
export function tallyRightSwipes(votes: Vote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of votes) {
    if (v.direction !== "right") continue;
    counts.set(v.restaurantId, (counts.get(v.restaurantId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Weighted score per restaurant used to pick the winner: a super-like counts SUPER_WEIGHT, a normal
 * right-swipe counts 1. Kept separate from tallyRightSwipes so the *display* stays an honest
 * headcount ("3 of 5 wanted it") while a super-like can still tip a close race.
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
 * Majority wins: the restaurant with the most right-swipes takes it. Ties are broken by deck order
 * (the earlier card wins), which keeps the result deterministic. Returns null when nobody swiped
 * right on anything, or when every place that got a right-swipe was also vetoed.
 *
 * A plain left swipe is still only a downvote. A veto is the exception, and it is absolute: it wins
 * over any number of right-swipes, including super-likes, because a veto that a big enough majority
 * could overrule would not be a veto.
 */
export function decideWinner(
  deck: Restaurant[],
  votes: Vote[],
): DecisionResult | null {
  const scores = tallyScores(votes); // weighted — decides the winner
  const counts = tallyRightSwipes(votes); // unweighted — the headcount we display
  const vetoed = vetoedRestaurantIds(votes);
  // Array.sort is stable: equal scores keep deck order, preserving the original deterministic
  // tie-break while also giving us the group's next-best choices from the very same decision.
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
  return {
    restaurant: winner.restaurant,
    rightSwipes: winner.rightSwipes,
    alternatives: rest.slice(0, 2).map(({ restaurant, rightSwipes }) => ({ restaurant, rightSwipes })),
  };
}

/**
 * Which of the given participants have cast a vote on every deck item (i.e. finished the round).
 * Order follows participantIds. Used both to decide when the round is over and, when the host opted
 * to reveal it, to show who's already done.
 */
export function finishedParticipantIds(
  votes: Vote[],
  participantIds: string[],
  deckSize: number,
): string[] {
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
export function countFinished(
  votes: Vote[],
  participantIds: string[],
  deckSize: number,
): number {
  return finishedParticipantIds(votes, participantIds, deckSize).length;
}
