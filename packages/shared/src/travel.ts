/*
 * Roughly how long it takes to get there, because "3.1 mi" is not a unit anybody argues in.
 *
 * An estimate, and honestly one: `distanceMeters` is straight-line from the search point, so real
 * streets are longer. The detour factor below is the usual correction for a city grid. No routing
 * API is involved and none is worth paying for to decide where six people eat.
 */

/** Streets are not straight. The usual correction for a grid. */
const DETOUR = 1.3;
/** Metres a minute: an unhurried walk, and city driving with lights and parking. */
const WALK = 78;
const DRIVE = 300;
/** Past this, nobody is walking to dinner. */
const WALKABLE_METRES = 1400;

export interface Travel {
  minutes: number;
  mode: "walk" | "drive";
}

export function travelEstimate(distanceMeters: number): Travel | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  const along = distanceMeters * DETOUR;
  const mode = distanceMeters <= WALKABLE_METRES ? "walk" : "drive";
  const minutes = Math.max(1, Math.round(along / (mode === "walk" ? WALK : DRIVE)));
  return { minutes, mode };
}

/** "8 min walk" / "12 min drive". Null when there is no usable distance. */
export function travelLabel(distanceMeters: number): string | null {
  const travel = travelEstimate(distanceMeters);
  return travel && `${travel.minutes} min ${travel.mode}`;
}
