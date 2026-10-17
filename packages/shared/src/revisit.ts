import type { VisitedPlace } from "./types.js";

// Recent visits have a cooldown; explicit exclusions remain permanent.

export const REVISIT_AFTER_DAYS = 90;

const DAY_MS = 86_400_000;

export function daysSince(visitedAt: string, now: Date): number {
  const at = Date.parse(visitedAt);
  // An unparseable timestamp must not read as "visited today" and hide the place forever.
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - at) / DAY_MS);
}

/** Places to keep out of the next deck: never-agains, plus anything still inside the cooldown. */
export function blockedIds(visited: readonly VisitedPlace[], now = new Date()): Set<string> {
  const blocked = new Set<string>();
  for (const place of visited) {
    if (place.neverAgain) blocked.add(place.restaurantId);
    else if (daysSince(place.visitedAt, now) < REVISIT_AFTER_DAYS) blocked.add(place.restaurantId);
  }
  return blocked;
}

/**
 * A place the group has been to before, out of cooldown and back in the deck.
 *
 * Worth saying out loud rather than letting it reappear as though it were new: half the value of a
 * place coming back is remembering you liked it. Null for anywhere they have not been.
 */
export function revisitNote(
  visited: readonly VisitedPlace[],
  restaurantId: string,
  now = new Date(),
): string | null {
  const place = visited.find((entry) => entry.restaurantId === restaurantId);
  if (!place || place.neverAgain) return null;
  const days = daysSince(place.visitedAt, now);
  if (!Number.isFinite(days) || days < REVISIT_AFTER_DAYS) return null;
  const months = Math.floor(days / 30);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return years === 1 ? "you came here about a year ago" : `you came here about ${years} years ago`;
  }
  return `you came here about ${months} months ago`;
}
