import type { Restaurant } from "@wherever/shared";

// Mock data has no photos, so each category gets a themed gradient + emoji.
const CATEGORY_STYLE: Record<string, { emoji: string; gradient: string }> = {
  Pizza: { emoji: "🍕", gradient: "linear-gradient(135deg, #ff5e2c, #ff2d78)" },
  Tacos: { emoji: "🌮", gradient: "linear-gradient(135deg, #ff8a3d, #ff5e2c)" },
  Ramen: { emoji: "🍜", gradient: "linear-gradient(135deg, #7c3aed, #ff2d78)" },
  Burgers: { emoji: "🍔", gradient: "linear-gradient(135deg, #ff8a3d, #ff2d78)" },
  Healthy: { emoji: "🥗", gradient: "linear-gradient(135deg, #d7ff3e, #7c3aed)" },
};
const FALLBACK = {
  emoji: "🍽️",
  gradient: "linear-gradient(135deg, #ff5e2c, #7c3aed)",
};

export function styleFor(category: string) {
  return CATEGORY_STYLE[category] ?? FALLBACK;
}

export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1609).toFixed(1)} mi`;
}

export function priceLabel(tier: Restaurant["priceTier"]): string {
  return "$".repeat(tier);
}
