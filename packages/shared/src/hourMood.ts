/*
 * The background follows the clock, because this app is only ever opened at one kind of moment and
 * that moment looks different at 6pm than at 1am.
 *
 * Two rules hold it together. The dinner window keeps the brand's warm orange-and-pink, because that
 * is the palette on the landing page and prime time is the wrong hour to stop looking like yourself.
 * And opacity stays inside a narrow band: the aurora sits behind every screen, so anything brighter
 * starts eating text contrast.
 */

export interface Mood {
  id: "morning" | "afternoon" | "golden" | "evening" | "late" | "small-hours";
  /** The three aurora stops, warm to cool. */
  from: string;
  via: string;
  to: string;
  /** Blurred backdrop behind all text, so this is deliberately a narrow range. */
  opacity: number;
}

const MOODS: Record<Mood["id"], Omit<Mood, "id">> = {
  // Cool and unhurried. Nobody is picking dinner at 8am, so this one gets out of the way.
  morning: { from: "#3d6b8f", via: "#7c3aed", to: "#1f2a44", opacity: 0.34 },
  afternoon: { from: "#c2622f", via: "#8b3ba8", to: "#2c2350", opacity: 0.42 },
  // The brand palette, unchanged: ember, flare, grape.
  golden: { from: "#ff5e2c", via: "#ff2d78", to: "#7c3aed", opacity: 0.55 },
  evening: { from: "#e0432f", via: "#d62a7a", to: "#5b2ec4", opacity: 0.52 },
  late: { from: "#8f3a5e", via: "#5c2f9e", to: "#1b1b3a", opacity: 0.46 },
  // Past one in the morning the argument is about a 24-hour diner. Let it go cold.
  "small-hours": { from: "#2f4a7a", via: "#43308c", to: "#101026", opacity: 0.38 },
};

/** Which stretch of the day an hour belongs to. Exhaustive over 0-23. */
function idFor(h: number): Mood["id"] {
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 16) return "afternoon";
  if (h >= 16 && h < 19) return "golden";
  if (h >= 19 && h < 22) return "evening";
  if (h >= 22 || h < 1) return "late";
  return "small-hours";
}

/** Local hour to mood. Anything unusable falls back to the brand's own look. */
export function hourMood(hour: number): Mood {
  if (!Number.isFinite(hour)) return { id: "golden", ...MOODS.golden };
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const id = idFor(h);
  return { id, ...MOODS[id] };
}

export const ALL_MOOD_IDS = Object.keys(MOODS) as Mood["id"][];
