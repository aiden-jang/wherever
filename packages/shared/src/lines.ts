/*
 * Every waiting or turning point in the app says something, in one voice, from one place.
 *
 * The landing had a rotating set of these and nowhere else did, so the app opened funny and then went
 * quiet exactly where a group is most bored: dealing, waiting on the slow one, and a dead tie.
 */

export type Moment =
  /** The landing page, under the buttons. */
  | "landing"
  /** The deck is being fetched and dealt. */
  | "dealing"
  /** You are done swiping and somebody else is not. */
  | "waiting"
  /** Two places finished level and the tie is about to be broken. */
  | "tie"
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
    "It's going to be tacos. It's always tacos. Vote anyway.",
    "You have a favorite. Say it with a swipe.",
    "The group chat: 200 messages, zero decisions.",
    "Someone will say 'I'm easy.' They are lying.",
    "Nobody's driving 40 minutes. Be honest.",
    "'Anywhere is fine.' Cool. We'll pick for you.",
    "You already know. Just swipe.",
    "Democracy, for dinner. Keep up.",
    "The vegetarian remembers last time.",
    "You're hungry and stalling. Iconic.",
    "Whoever picked last time doesn't get a vote. Kidding. Mostly.",
    "Six good options. You'll still say 'idk.'",
    "This took your group 45 minutes last time. Not tonight.",
  ],
  dealing: [
    "Finding places you'll still complain about...",
    "Shuffling. No, you can't see them yet.",
    "Finding places that are actually open.",
    "Dealing. Try to have an opinion ready.",
    "Pulling the deck. Nobody has ruined it yet.",
  ],
  waiting: [
    "Your votes are in. Now we wait on everyone else. The longest part.",
    "You're done. Somebody is still reading the menu.",
    "Everyone's waiting on one person. It's never you, apparently.",
    "Your votes are in. The slow one knows what they did.",
    "Done. Now we find out who takes dinner seriously.",
  ],
  nudged: [
    "Everyone is waiting on you. No pressure.",
    "The group would like a decision this evening.",
    "You are the slow one. It has been noticed.",
    "Still you. Swipe something.",
  ],
  quiet: [
    "No votes yet. The deliberation is intense.",
    "Nothing yet. Everyone is reading every single menu.",
    "Zero votes. Riveting stuff so far.",
    "No votes yet. Somebody go first, it's allowed.",
  ],
  vetoSpent: [
    "One veto a round, and you already used yours.",
    "You killed something already. One per customer.",
    "Your veto is spent. That was your one act of violence.",
    "Already vetoed tonight. The rest you have to argue for.",
  ],
  superSpent: [
    "One super-like a round. Yours is already out there.",
    "You only get the one star. It has been given.",
    "Super-like spent. Everything else gets a normal opinion.",
    "That star is gone. Champion something else the hard way.",
  ],
  tie: [
    "Dead tie. Of course it is.",
    "A tie. Nobody wanted to be decisive tonight.",
    "Level. This is what democracy gets you.",
    "Tied. Somebody could have just picked.",
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
