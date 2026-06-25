// Pure decision logic for a session. No I/O, no transport: just data in, result
// out. This is the heart of the app and the part that must be provably correct,
// so it lives here and is exhaustively unit-tested (see decision.test.ts).

import type { Restaurant, SwipeDirection } from "./types.js";

export interface Vote {
  participantId: string;
  restaurantId: string;
  direction: SwipeDirection;
}

export interface DecisionResult {
  restaurant: Restaurant;
  rightSwipes: number;
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
 * Majority wins: the restaurant with the most right-swipes takes it. A left
 * swipe is a downvote, never a veto. Ties are broken by deck order (the earlier
 * card wins), which keeps the result deterministic. Returns null when nobody
 * swiped right on anything.
 */
export function decideWinner(
  deck: Restaurant[],
  votes: Vote[],
): DecisionResult | null {
  const counts = tallyRightSwipes(votes);
  let best: DecisionResult | null = null;
  for (const restaurant of deck) {
    const rightSwipes = counts.get(restaurant.id) ?? 0;
    if (rightSwipes === 0) continue;
    // Strict greater-than means the first card seen at a given count keeps the
    // lead, so ties resolve to deck order.
    if (!best || rightSwipes > best.rightSwipes) {
      best = { restaurant, rightSwipes };
    }
  }
  return best;
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
  if (deckSize === 0) return 0;
  const votedByParticipant = new Map<string, Set<string>>();
  for (const v of votes) {
    let set = votedByParticipant.get(v.participantId);
    if (!set) {
      set = new Set();
      votedByParticipant.set(v.participantId, set);
    }
    set.add(v.restaurantId);
  }
  let finished = 0;
  for (const pid of participantIds) {
    if ((votedByParticipant.get(pid)?.size ?? 0) >= deckSize) finished++;
  }
  return finished;
}
