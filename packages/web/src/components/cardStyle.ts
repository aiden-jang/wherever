import type { Restaurant } from "@wherever/shared";

// When a card has no photo, it falls back to a cuisine-matched emoji on a themed gradient. Google's
// category is a display string like "Pizza Restaurant" / "Taiwanese Restaurant", so we match on
// keywords (substring, case-insensitive) rather than exact names — otherwise everything real drops
// to the generic plate. A small gradient palette keeps neighbouring cards from all looking alike.
// Literal hex, not theme variables: shareCard.ts parses these stops to paint the winner card on a
// canvas, and a canvas cannot read a CSS variable.
const GRADIENTS = {
  ember: "linear-gradient(135deg, #ff5e2c, #ff2d78)",
  warm: "linear-gradient(135deg, #ff8a3d, #ff2d78)",
  grape: "linear-gradient(135deg, #8b5cf6, #ff2d78)",
  ocean: "linear-gradient(135deg, #2c9cff, #7c3aed)",
  forest: "linear-gradient(135deg, #12b886, #7c3aed)",
  gold: "linear-gradient(135deg, #ffd43b, #ff8a3d)",
} as const;

// Ordered: more specific keywords first (e.g. "wine" before "bar", "ice cream" before generic).
const CATEGORY_KEYWORDS: Array<[string, string, string]> = [
  ["pizza", "🍕", GRADIENTS.ember],
  ["sushi", "🍣", GRADIENTS.ocean],
  ["ramen", "🍜", GRADIENTS.grape],
  ["noodle", "🍜", GRADIENTS.grape],
  ["hamburger", "🍔", GRADIENTS.warm],
  ["burger", "🍔", GRADIENTS.warm],
  ["taco", "🌮", GRADIENTS.warm],
  ["mexican", "🌯", GRADIENTS.warm],
  ["chinese", "🥡", GRADIENTS.ember],
  ["thai", "🥘", GRADIENTS.forest],
  ["indian", "🍛", GRADIENTS.gold],
  ["italian", "🍝", GRADIENTS.ember],
  ["korean", "🍲", GRADIENTS.warm],
  ["japanese", "🍱", GRADIENTS.ocean],
  ["vietnam", "🍜", GRADIENTS.forest],
  ["taiwanese", "🥟", GRADIENTS.ocean],
  ["dim sum", "🥟", GRADIENTS.ocean],
  ["dumpling", "🥟", GRADIENTS.ocean],
  ["hot pot", "🍲", GRADIENTS.ember],
  ["turkish", "🥙", GRADIENTS.gold],
  ["tapas", "🥘", GRADIENTS.warm],
  ["german", "🥨", GRADIENTS.gold],
  ["brazilian", "🥩", GRADIENTS.ember],
  ["filipino", "🍚", GRADIENTS.warm],
  ["bubble tea", "🧋", GRADIENTS.grape],
  ["boba", "🧋", GRADIENTS.grape],
  ["mediterranean", "🫒", GRADIENTS.forest],
  ["greek", "🥙", GRADIENTS.ocean],
  ["middle eastern", "🧆", GRADIENTS.gold],
  ["french", "🥐", GRADIENTS.grape],
  ["spanish", "🥘", GRADIENTS.warm],
  ["steak", "🥩", GRADIENTS.ember],
  ["barbecue", "🍖", GRADIENTS.ember],
  ["bbq", "🍖", GRADIENTS.ember],
  ["seafood", "🦞", GRADIENTS.ocean],
  ["fish", "🐟", GRADIENTS.ocean],
  ["ice cream", "🍦", GRADIENTS.ocean],
  ["dessert", "🍰", GRADIENTS.grape],
  ["bakery", "🥯", GRADIENTS.gold],
  ["sandwich", "🥪", GRADIENTS.gold],
  ["deli", "🥓", GRADIENTS.warm],
  ["diner", "🍳", GRADIENTS.gold],
  ["breakfast", "🥞", GRADIENTS.gold],
  ["brunch", "🥂", GRADIENTS.grape],
  ["vegan", "🌱", GRADIENTS.forest],
  ["vegetarian", "🥗", GRADIENTS.forest],
  ["healthy", "🥗", GRADIENTS.forest],
  ["juice", "🧃", GRADIENTS.forest],
  ["coffee", "☕", GRADIENTS.warm],
  ["cafe", "☕", GRADIENTS.warm],
  ["café", "☕", GRADIENTS.warm],
  ["wine", "🍷", GRADIENTS.grape],
  ["pub", "🍺", GRADIENTS.gold],
  ["bar", "🍸", GRADIENTS.grape],
  ["fast food", "🍟", GRADIENTS.warm],
  // Broad catch-alls, last so specific cuisines above win first.
  ["soul food", "🍗", GRADIENTS.gold],
  ["southern", "🍗", GRADIENTS.gold],
  ["comfort", "🍗", GRADIENTS.gold],
  ["asian", "🥢", GRADIENTS.grape],
];

const FALLBACK = { emoji: "🍽️", gradient: GRADIENTS.grape };

export function styleFor(category: string) {
  const c = category.toLowerCase();
  const hit = CATEGORY_KEYWORDS.find(([kw]) => c.includes(kw));
  return hit ? { emoji: hit[1], gradient: hit[2] } : FALLBACK;
}

/**
 * Google's primaryTypeDisplayName is often "<Cuisine> Restaurant" (e.g. "Taiwanese Restaurant"),
 * which is redundant on a restaurant card and long enough to wrap the meta row on a phone. Drop the
 * trailing "Restaurant" so it reads "Taiwanese"; leave shorter types (Bar, Café, Bakery) untouched.
 */
export function categoryLabel(category: string): string {
  const trimmed = category.replace(/\s+restaurant$/i, "").trim();
  return trimmed || category;
}

export function priceLabel(tier: Restaurant["priceTier"]): string {
  return "$".repeat(tier);
}

/** Compact review count, e.g. 1540 -> "1.5k". */
export function reviewCountLabel(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}
