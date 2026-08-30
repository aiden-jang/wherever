import type { Restaurant } from "./types.js";

/*
 * Deck order, deliberately meaningless.
 *
 * The source hands places back best-first, so the top of every deck is the same handful of
 * safe, highly-rated places and the interesting ones are behind a dozen swipes nobody makes.
 * The "chaotic" vibe promises everything is on the table; this is the only thing that delivers it,
 * since widening filters the group had already left wide changes nothing.
 *
 * Seeded rather than random: the deck is built once and cached, but a fixed seed means a bug in
 * ordering can be reproduced from the session code alone.
 */

/** mulberry32: small, fast, and good enough for shuffling dinner. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Returns a new array; the caller's deck is left alone. */
export function shuffleDeck(deck: readonly Restaurant[], seed: string): Restaurant[] {
  const out = [...deck];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
