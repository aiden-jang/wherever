import type { AmenityKey, SessionFilters } from "./types.js";

/*
 * What kind of night this is, decided the same way everything else here is decided.
 *
 * The app was already good at resolving *which restaurant* and had nothing for the argument that comes
 * before it, which is the one that actually stalls a group: nobody wants to be the person who says
 * "somewhere nice" and then gets held to it. So a vibe is a vote, not a setting. Everyone picks a word,
 * the group gets one word back, and no one finds out who said fancy.
 *
 * That last part is deliberate and matches how swipes already work: the server sends tallies, never a
 * map of who picked what. A vibe is a mildly embarrassing thing to admit to in a group of five, and an
 * app that exposes it gets one honest round and then four rounds of people picking what they think the
 * others want.
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
    emoji: "🕯️",
    blurb: "Close by, warm, and nobody rushes you out.",
    filters: { priceTiers: [2, 3], radiusMeters: 1600, minRating: 4.2 },
  },
  {
    id: "quick",
    label: "quick",
    emoji: "⚡",
    blurb: "In, fed, out. Somewhere open right now.",
    filters: { priceTiers: [1, 2], radiusMeters: 800, openNow: true, sort: "distance", amenities: ["takeout"] },
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
    filters: { priceTiers: [1, 2, 3, 4], radiusMeters: 8000, minRating: 0, minReviews: 0 },
  },
  {
    id: "adventurous",
    label: "adventurous",
    emoji: "🧭",
    blurb: "Further out, and somewhere none of you can pronounce.",
    filters: { priceTiers: [1, 2, 3], radiusMeters: 8000, minReviews: 0 },
  },
];

/**
 * The ids, for the wire schema.
 *
 * Derived from VIBES rather than written out again, so adding a vibe cannot produce one the app offers
 * and the validator rejects. Typed as a non-empty tuple because that is what z.enum requires.
 */
export const VIBE_IDS = VIBES.map((option) => option.id) as [Vibe, ...Vibe[]];

const BY_ID = new Map(VIBES.map((option) => [option.id, option]));

export function vibeOption(vibe: Vibe): VibeOption {
  // Non-null: BY_ID is built from VIBES, which covers the union exhaustively.
  return BY_ID.get(vibe)!;
}

/**
 * Roughly how much of the map a vibe leaves standing.
 *
 * Derived from the filters rather than hand-assigned, so it cannot drift when a vibe is retuned. It is a
 * proxy and not a count: what matters is only the ordering, which decides who wins a tie.
 */
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
 * One word for the group, from everybody's word.
 *
 * Ties break toward the broadest vibe, which is the whole judgement in this file. A group that cannot
 * agree between quick and fancy has not narrowly chosen quick; it has told you it does not know, and the
 * useful response to that is more of the map rather than less. Breaking toward the narrower option would
 * hand a coin-flip the power to hide most of the city.
 */
export function resolveVibe(counts: Partial<Record<Vibe, number>>): VibeReading {
  const tallied = VIBES.map((option) => [option.id, counts[option.id] ?? 0] as const).filter(([, n]) => n > 0);
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

/**
 * What the lobby says about it.
 *
 * Never names a person and never reports a count of one as agreement. "Everyone wants quick" is a lovely
 * thing to read and a lie in a group where one person has voted, so the unanimous line requires the whole
 * group to have actually said so.
 */
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
 * The vibe's filters, laid over whatever the host already had.
 *
 * Only the keys a vibe actually names are replaced, so a host who set a neighbourhood, a cuisine or a
 * round timer keeps them: those are not opinions about the mood. Amenities replace rather than merge,
 * because accumulating them across two vibes eventually requires a place that does everything, and the
 * deck quietly empties.
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
