// Keep a participant in one reaction lane; anonymous events fall back to event ID.
const LANES = 61;
const FIRST = 20;

function hashed(seed: string): number {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) sum = (sum + seed.charCodeAt(i) * (i + 1)) % 9973;
  return FIRST + (sum % LANES);
}

/** Space known seats evenly by participant ID, including participants who share a name. */
export function reactionLane(seatKey: string, id: string, roster: readonly string[] = []): number {
  const key = seatKey.trim();
  if (!key) return hashed(id);
  const seat = roster.indexOf(key);
  if (seat === -1 || roster.length < 2) return hashed(key);
  // Evenly across the band, inset by half a step so nobody sits on an edge.
  const step = LANES / roster.length;
  return Math.round(FIRST + step * (seat + 0.5));
}
