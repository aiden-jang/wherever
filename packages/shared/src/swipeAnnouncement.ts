import type { SwipeDirection } from "./types.js";

/*
 * What just happened, for the live region.
 *
 * Voting was silent. The card is well labelled and the arrow keys work, but pressing one swapped the
 * card underneath with no announcement, so a screen-reader user got no confirmation the vote landed,
 * no idea what was now in front of them, and no sense of how far through the deck they were. Every
 * other realtime moment in this app already announces itself; this was the one that did not.
 */

export interface SwipeAnnouncement {
  direction: SwipeDirection;
  isSuper: boolean;
  isVeto: boolean;
  /** The place just voted on. */
  name: string;
  /** The place now in front of them, or null at the end of the deck. */
  next: string | null;
  /** 1-based position of `next` in the deck. */
  position: number;
  total: number;
}

function verb(a: SwipeAnnouncement): string {
  if (a.isVeto) return `Vetoed ${a.name}. It is out for everyone`;
  if (a.isSuper) return `Super-liked ${a.name}`;
  return a.direction === "right" ? `Liked ${a.name}` : `Passed on ${a.name}`;
}

export function swipeAnnouncement(a: SwipeAnnouncement): string {
  const done = `${verb(a)}.`;
  if (!a.next) return `${done} That is all of them. Waiting on everyone else.`;
  return `${done} Next, ${a.next}. ${a.position} of ${a.total}.`;
}

/** Undo puts a card back, which is just as invisible without saying so. */
export function undoAnnouncement(name: string, position: number, total: number): string {
  return `Took that back. ${name} again. ${position} of ${total}.`;
}
