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

/** Approximate travel time. Null when there is no usable distance. */
export function travelLabel(distanceMeters: number): string | null {
  const travel = travelEstimate(distanceMeters);
  return travel && `≈ ${travel.minutes} min ${travel.mode}`;
}

/*
 * The raw distance, in one unit system.
 *
 * One system throughout: feet below a tenth of a mile, miles above it. Switching at a kilometre --
 * "750m" under, "0.6 mi" over -- measures two cards a block apart in different units, for an
 * audience that reads miles.
 */
export function distanceLabel(distanceMeters: number): string | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  const miles = distanceMeters / 1609.34;
  // Under a tenth of a mile "0.1 mi" is a shrug; feet is the number people picture.
  if (miles < 0.1) return `${Math.max(50, Math.round((distanceMeters * 3.28084) / 50) * 50)} ft`;
  return `${miles.toFixed(1)} mi`;
}

/**
 * What to show for "how far away is it": the estimate people decide on, the raw distance if there is
 * no usable estimate, and nothing at all rather than "NaN mi" when the source gave no distance.
 */
export function distanceText(distanceMeters: number): string | null {
  return travelLabel(distanceMeters) ?? distanceLabel(distanceMeters);
}
