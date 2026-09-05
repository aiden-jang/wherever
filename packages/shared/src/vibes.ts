import type { AmenityKey, SessionFilters } from "./types.js";

/*
 * Tallies only on the wire, never a map of who picked what. Admitting to "fancy" in a group of five is
 * embarrassing enough that naming people gets you one honest round and then four performative ones.
 */

export type Vibe = "cozy" | "quick" | "fancy" | "chaotic" | "adventurous";

export interface VibeOption {
  id: Vibe;
  label: string;
  emoji: string;
  /** One line, in the app's voice, describing the night rather than the filters. */
  blurb: string;
  /** What this vibe means in the app's existing filter vocabulary. */
  filters: Partial<SessionFilters>;
}

export const VIBES: VibeOption[] = [
  {
    id: "cozy",
    label: "cozy",
    emoji: "🫖",
    blurb: "Close by, warm, and nobody rushes you out.",
    filters: { priceTiers: [2, 3], radiusMeters: 1600, minRating: 4.2 },
  },
  {
    id: "quick",
    label: "quick",
    emoji: "⚡",
    blurb: "In, fed, out. Somewhere open right now.",
    filters: {
      priceTiers: [1, 2],
      radiusMeters: 800,
      openNow: true,
      sort: "distance",
      amenities: ["takeout"],
    },
  },
  {
    id: "fancy",
    label: "fancy",
    emoji: "🥂",
    blurb: "Worth the trip and worth the tablecloth.",
    filters: { priceTiers: [3, 4], radiusMeters: 4000, minRating: 4.4, amenities: ["reservable"] },
  },
  {
    id: "chaotic",
    label: "chaotic",
    emoji: "🎲",
    blurb: "Everything is on the table. Good luck.",
    filters: { priceTiers: [1, 2, 3, 4], radiusMeters: 8000, minRating: 0, minReviews: 0, shuffle: true },
  },
  {
    id: "adventurous",
    label: "adventurous",
    emoji: "🧭",
    blurb: "Further out, and somewhere none of you can pronounce.",
    filters: { priceTiers: [1, 2, 3], radiusMeters: 8000, minReviews: 0 },
  },
];

/** Derived, so adding a vibe cannot produce one the app offers and the validator rejects. */
export const VIBE_IDS = VIBES.map((option) => option.id) as [Vibe, ...Vibe[]];

const BY_ID = new Map(VIBES.map((option) => [option.id, option]));

export function vibeOption(vibe: Vibe): VibeOption {
  // Non-null: BY_ID is built from VIBES, which covers the union exhaustively.
  return BY_ID.get(vibe)!;
}

/** A proxy, not a count. Derived from the filters so it cannot drift; only the ordering matters. */
export function vibeBreadth(vibe: Vibe): number {
  const { filters } = vibeOption(vibe);
  const tiers = filters.priceTiers?.length ?? 4;
  const radius = filters.radiusMeters ?? 3000;
  const amenities = filters.amenities?.length ?? 0;
  let breadth = tiers * radius;
  // Each required amenity throws away most of the map, far more than a tighter radius does.
  breadth /= 2 ** amenities;
  if (filters.openNow) breadth /= 2;
  // A rating floor bites hard at the top of the scale: 4.4 keeps far less than 4.2.
  if (filters.minRating) breadth /= 1 + Math.max(0, filters.minRating - 4) * 4;
  return Math.round(breadth);
}

export interface VibeReading {
  /** Null until somebody has picked. */
  vibe: Vibe | null;
  /** How many picked the winning vibe. */
  votes: number;
  /** How many picked anything at all, which is not the same as the group size. */
  total: number;
  /** True when the top pick was tied and had to be broken. */
  divided: boolean;
  /** The vibes that tied and lost, for copy that admits the group was split. */
  runnersUp: Vibe[];
}

/**
 * Ties break toward the broadest vibe. A group split between quick and fancy has not narrowly chosen
 * quick, it has said it does not know, and a coin flip should not hide most of the city.
 */
export function resolveVibe(counts: Partial<Record<Vibe, number>>): VibeReading {
  const tallied = VIBES.map((option) => [option.id, counts[option.id] ?? 0] as const).filter(
    ([, n]) => n > 0,
  );
  const total = tallied.reduce((sum, [, n]) => sum + n, 0);
  if (tallied.length === 0) return { vibe: null, votes: 0, total: 0, divided: false, runnersUp: [] };

  const top = Math.max(...tallied.map(([, n]) => n));
  const leaders = tallied.filter(([, n]) => n === top).map(([vibe]) => vibe);
  const [winner, ...rest] = [...leaders].sort((a, b) => vibeBreadth(b) - vibeBreadth(a));

  return {
    vibe: winner!,
    votes: top,
    total,
    divided: leaders.length > 1,
    runnersUp: rest,
  };
}

/** Unanimous requires the whole group, not just everyone who has voted so far. */
export function vibeReadingLine(reading: VibeReading, groupSize: number): string {
  if (!reading.vibe) return "No vibe yet. Somebody has to go first.";
  const option = vibeOption(reading.vibe);

  if (reading.divided) {
    const others = reading.runnersUp.map((vibe) => vibeOption(vibe).label).join(" and ");
    return `Split between ${option.label} and ${others}, so we are going wide.`;
  }
  if (reading.total >= groupSize && reading.votes === reading.total && groupSize > 1) {
    return `Unanimously ${option.label}. That never happens.`;
  }
  if (reading.votes === reading.total) return `${option.label} so far, and nobody has argued.`;
  return `${option.label} is ahead, ${reading.votes} of ${reading.total}.`;
}

/**
 * What a vibe did to the deck, in words. Picking one silently rewrites the filters and the deck looks
 * like any other, so without this the choice reads as decoration.
 *
 * Derived from the vibe's own filters, never written by hand, so a vibe whose numbers change cannot
 * end up described as something it no longer does.
 */
export function vibeEffect(vibe: Vibe, base: SessionFilters): string[] {
  const { filters: wanted } = vibeOption(vibe);
  const out: string[] = [];

  if (wanted.radiusMeters !== undefined && wanted.radiusMeters !== base.radiusMeters) {
    const km = wanted.radiusMeters / 1000;
    const distance = km >= 1 ? `${Number.isInteger(km) ? km : km.toFixed(1)} km` : `${wanted.radiusMeters} m`;
    out.push(
      `${wanted.radiusMeters > base.radiusMeters ? "widened" : "tightened"} the search to ${distance}`,
    );
  }
  if (wanted.minRating !== undefined && wanted.minRating !== base.minRating) {
    out.push(
      wanted.minRating === 0 ? "dropped the rating floor" : `raised the rating floor to ${wanted.minRating}`,
    );
  }
  // Only a narrowing is news. The default allows every tier, so "kept $, $$, $$$, $$$$" would be
  // reporting that nothing happened.
  const allowed = base.priceTiers ?? [1, 2, 3, 4].filter((tier) => tier <= (base.maxPriceTier ?? 4));
  if (wanted.priceTiers && wanted.priceTiers.length > 0 && wanted.priceTiers.length < allowed.length) {
    out.push(`kept ${wanted.priceTiers.map((tier) => "$".repeat(tier)).join(", ")}`);
  }
  if (wanted.shuffle && !base.shuffle) out.push("dealt the deck in no particular order");
  if (wanted.openNow && !base.openNow) out.push("only somewhere open now");
  if (wanted.amenities && wanted.amenities.length > 0)
    out.push(`asked for ${wanted.amenities.join(" and ")}`);
  return out;
}

/** Never null. A vibe can genuinely change nothing - chaotic against wide-open defaults asks for the
 *  deck you were already getting - and whoever just picked one is owed an answer either way. */
export function vibeEffectLine(vibe: Vibe, base: SessionFilters): string {
  const label = vibeOption(vibe).label;
  const parts = vibeEffect(vibe, base);
  if (parts.length === 0) return `${label}: nothing to change, the filters were already there.`;
  return `${label}: ${parts.slice(0, 2).join(", ")}.`;
}

/**
 * Only the keys a vibe names are replaced, so a neighbourhood or cuisine survives it. Amenities replace
 * rather than merge: quick then fancy would demand takeout AND reservable, and the deck empties.
 */
export function applyVibe(filters: SessionFilters, vibe: Vibe): SessionFilters {
  const { filters: wanted } = vibeOption(vibe);
  return {
    ...filters,
    ...wanted,
    ...(wanted.amenities ? { amenities: [...wanted.amenities] as AmenityKey[] } : {}),
    ...(wanted.priceTiers ? { priceTiers: [...wanted.priceTiers] } : {}),
  };
}
