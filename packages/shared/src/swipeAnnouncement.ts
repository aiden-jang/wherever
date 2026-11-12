import type { SwipeDirection } from "./types.js";

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
  groupRound?: boolean;
}

function verb(a: SwipeAnnouncement): string {
  if (a.isVeto) return `Vetoed ${a.name}. It is out for everyone`;
  if (a.isSuper) return `Super-liked ${a.name}`;
  return a.direction === "right" ? `Liked ${a.name}` : `Passed on ${a.name}`;
}

export function swipeAnnouncement(a: SwipeAnnouncement): string {
  const done = `${verb(a)}.`;
  if (!a.next)
    return `${done} Your votes are in. ${a.groupRound === false ? "Choosing your dinner." : "Waiting for the group."}`;
  return `${done} Next, ${a.next}. ${a.position} of ${a.total}.`;
}

/** Undo puts a card back, which is just as invisible without saying so. */
export function undoAnnouncement(name: string, position: number, total: number): string {
  return `Vote undone. ${name} again. ${position} of ${total}.`;
}
