/* Short supporting lines stay factual about the state and leave the joke on dinner indecision. */

export type Moment =
  /** The landing page, under the buttons. */
  | "landing"
  /** The deck is being fetched and dealt. */
  | "dealing"
  /** You are done swiping and somebody else is not. */
  | "waiting"
  /** Two places finished level and the tie is about to be broken. */
  | "tie"
  /** One person voted, so there was never a committee to disagree with. */
  | "solo"
  /** The host has asked you, specifically, to get on with it. */
  | "nudged"
  /** The round is running and not one person has voted yet. */
  | "quiet"
  /** You tapped the veto again, having already spent it this round. */
  | "vetoSpent"
  /** You tapped the super-like again, having already spent it this round. */
  | "superSpent";

const LINES: Record<Moment, readonly string[]> = {
  landing: [
    "'Anything is fine.' Exceptions apply.",
    "Dinner plans. Some assembly required.",
    "The group chat has enough messages.",
    "An opinion is all you need to bring.",
  ],
  dealing: [
    "Finding options. Opinions to follow.",
    "Looking for somewhere to eat.",
    "A few places to consider.",
    "Putting the next round together.",
  ],
  waiting: [
    "Your votes are in. Other opinions are still pending.",
    "You're done. Dinner is still being discussed.",
    "Votes submitted. The menu research continues.",
    "Your part is done. The group is still deciding.",
  ],
  nudged: [
    "The group would like a decision this evening.",
    "The round is still open. Have your say.",
    "A little nudge. Dinner is still on the agenda.",
    "Your next vote would be welcome.",
  ],
  quiet: [
    "No votes yet. An unusually diplomatic group.",
    "No votes yet. Keeping the options open.",
    "No votes yet. Plenty to consider.",
    "No votes yet. Dinner is still a possibility.",
  ],
  vetoSpent: [
    "Veto used. Regular disapproval is still available.",
    "One veto per round. Yours is already in.",
    "Veto already used. Nope is still an option.",
    "Veto used. The rest get a regular vote.",
  ],
  superSpent: [
    "Super-like used. A regular yes still counts.",
    "One super-like per round. Yours is already in.",
    "Super-like already used. More favorites are allowed.",
    "Super-like used. Still plenty of room for a yes.",
  ],
  solo: [
    "Your call. Dinner is handled.",
    "You voted, you won. Landslide.",
    "One opinion. One dinner plan.",
    "The vote is in. Very efficient.",
  ],
  tie: [
    "Dead tie. Of course it is.",
    "A tie. Plenty of support to go around.",
    "Same score. Dinner remains a close contest.",
    "Even on points. A familiar situation.",
  ],
};

export const ALL_MOMENTS = Object.keys(LINES) as Moment[];

/**
 * A line for this moment. `seed` picks one; the same seed gives the same line, so a re-render or a
 * reconnect does not reshuffle the sentence somebody is halfway through reading.
 */
export function line(moment: Moment, seed: number): string {
  const options = LINES[moment];
  const index = Math.abs(Math.trunc(seed)) % options.length;
  return options[index] as string;
}

export function linesFor(moment: Moment): readonly string[] {
  return LINES[moment];
}
