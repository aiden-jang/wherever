import type { VisitedPlace } from "./types.js";

export function blockedIds(picks: readonly VisitedPlace[]): Set<string> {
  return new Set(picks.map((place) => place.restaurantId));
}

export function revisitNote(picks: readonly VisitedPlace[], restaurantId: string): string | null {
  return picks.some((place) => place.restaurantId === restaurantId && !place.neverAgain)
    ? "Picked earlier in this room"
    : null;
}
