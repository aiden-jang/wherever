import type { SwipeDirection } from "./types.js";

// A short fast flick can express the same vote as a longer slow drag.

/** Past this, it is a vote however slowly it got there. */
export const THROW_DISTANCE = 110;
/** Past this speed it is a vote too, provided it actually moved. */
export const THROW_VELOCITY = 520;
/** Below this, a fast pointer is a tap or a scroll, not a throw. */
export const THROW_MIN_TRAVEL = 36;

export function throwVerdict(offsetX: number, velocityX: number): SwipeDirection | null {
  const flung = Math.abs(velocityX) >= THROW_VELOCITY && Math.abs(offsetX) >= THROW_MIN_TRAVEL;
  const dragged = Math.abs(offsetX) >= THROW_DISTANCE;
  if (!flung && !dragged) return null;
  // A flick decides its own direction; a slow drag is decided by where it ended up. They disagree
  // when somebody drags one way and snaps back the other, and the last thing they did wins.
  const by = flung ? velocityX : offsetX;
  return by > 0 ? "right" : "left";
}

/**
 * How far off-screen the card is thrown, in pixels. A hard flick should leave like it was thrown and
 * a card nudged over the line should barely clear the edge.
 */
export function throwDistance(velocityX: number): number {
  const speed = Math.min(Math.abs(velocityX), 3000);
  return 520 + speed * 0.24;
}

/** Seconds for the exit. Fast throws get out of the way; gentle ones take their time. */
export function throwDuration(velocityX: number): number {
  const speed = Math.min(Math.abs(velocityX), 3000);
  return Math.max(0.16, 0.34 - speed * 0.00006);
}
