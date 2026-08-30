/*
 * Which vertical lane a floating reaction rises in.
 *
 * The position used to come from the reaction's own random id, so the same person's reactions
 * appeared somewhere new every time and the emoji read as weather rather than as somebody in the
 * room with you. Seeded from the sender instead, everyone keeps their own lane for the whole round.
 *
 * Falls back to the id for anything with no sender, which is how the anonymous system events (a veto,
 * a super-like) stay anonymous. They are rendered differently anyway.
 */
const LANES = 61;
const FIRST = 20;

function hashed(seed: string): number {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) sum = (sum + seed.charCodeAt(i) * (i + 1)) % 9973;
  return FIRST + (sum % LANES);
}

/**
 * `roster` spreads a known group evenly instead of leaving it to the hash, which put two people at
 * 24% and 26% in a real session: legible, because the names are there, but they overlap.
 */
export function reactionLane(from: string, id: string, roster: readonly string[] = []): number {
  const name = from.trim();
  if (!name) return hashed(id);
  const seat = roster.indexOf(name);
  if (seat === -1 || roster.length < 2) return hashed(name);
  // Evenly across the band, inset by half a step so nobody sits on an edge.
  const step = LANES / roster.length;
  return Math.round(FIRST + step * (seat + 0.5));
}
