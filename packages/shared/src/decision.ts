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
  /**
   * How many other places finished on the winner's exact score. Zero for a clean win.
   *
   * The tie itself is broken by deck order, which every client agrees on. Without this the group is
   * never told a tie happened at all, and "we drew" is the most interesting thing a vote can do.
   */
  tiedWith: number;
  /**
   * True when a vetoed place outscored the winner: the group's actual favourite was killed.
   *
   * Vetoed places are dropped from the ranking before a winner is picked, silently, so a group could
   * agree on somewhere, have it vetoed, and be handed second place with no sign that the vote had
   * gone any other way. Deliberately a flag and not a name: the veto is anonymous on purpose, and
   * naming the place it killed narrows the vetoer down in a group of four.
   */
  vetoedTop: boolean;
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
    // A promoted backup was chosen by hand, so whatever the original vote tied on no longer applies,
    // and neither does what a veto did to it: the host has overridden the vote either way.
    tiedWith: 0,
    vetoedTop: false,
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
 * How close the runner-up came, when it came close.
 *
 * The tally is already computed and the runners-up are already carried for the Plan B list, but the
 * margin was never said, so "1 of 2 picked it" reads the same whether the group agreed or whether
 * one swipe decided the night. Null when it was not close, because "won by six" is not a story.
 *
 * Counted in right-swipes, the headcount people can check against each other, rather than the
 * weighted score a super-like inflates.
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
 * What ending the round early actually does, for the host about to do it.
 *
 * "just decide now" was a bare underlined link that decided instantly on the votes so far. It is the
 * one control here that acts on everybody else's behalf, and it read like a shortcut rather than the
 * thing it is: the unfinished cards simply never count.
 */
export function decideNowWarning(finishedCount: number, totalParticipants: number): string {
  const waiting = Math.max(0, totalParticipants - finishedCount);
  const who = waiting === 1 ? "1 person is" : `${waiting} people are`;
  return `${who} still swiping. Their unvoted cards will not count.`;
}

/**
 * How many cards ahead the furthest-along other person is. Zero when you are level or leading.
 *
 * Somebody who opens the link mid-round is dropped straight into a deck with no sign that voting
 * started without them, while the group watches "3 of 4 done" become "3 of 5" for no visible reason.
 * Counted from votes rather than from arrival time, so a reconnect that missed a stretch gets the
 * same honest answer as a genuine latecomer.
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
