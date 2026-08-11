import { amenityLabel, cuisineLabel } from "./constants.js";
import type { Restaurant, SessionFilters } from "./types.js";

export interface MatchReason {
  icon: string;
  label: string;
}

function distanceReason(meters: number): string {
  const miles = meters / 1609.344;
  return miles < 0.1 ? "A few steps away" : `${miles < 1 ? miles.toFixed(1) : Math.round(miles * 10) / 10} mi away`;
}

function categoryMatched(category: string, requested: string[]): string | null {
  const normalized = category.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) return null;
  const match = requested.find((value) => {
    const needle = value.toLowerCase().replace(/[^a-z]/g, "");
    return needle.length > 0 && (normalized.includes(needle) || needle.includes(normalized));
  });
  return match ? cuisineLabel(match) : null;
}

/** Human evidence for the result reveal, ordered from group agreement to practical fit. */
export function matchReasons(
  restaurant: Restaurant,
  filters: SessionFilters | undefined,
  rightSwipes: number,
  totalParticipants: number,
): MatchReason[] {
  const reasons: MatchReason[] = [];
  if (totalParticipants > 1 && rightSwipes === totalParticipants) {
    reasons.push({ icon: "✦", label: "Everyone said yes" });
  } else if (totalParticipants > 1) {
    reasons.push({ icon: "♥", label: `${rightSwipes} of ${totalParticipants} backed it` });
  } else {
    reasons.push({ icon: "✓", label: "Your top pick" });
  }

  if (restaurant.openNow === true) reasons.push({ icon: "◷", label: "Open right now" });

  const requestedCategory = filters ? categoryMatched(restaurant.category, filters.categories) : null;
  if (requestedCategory) reasons.push({ icon: "⌁", label: `${requestedCategory} craving matched` });

  const requiredAmenities = (filters?.amenities ?? []).filter((key) => restaurant.amenities?.[key] === true);
  for (const key of requiredAmenities.slice(0, 2)) {
    reasons.push({ icon: "✓", label: amenityLabel(key) });
  }

  const allowedPrices = filters?.priceTiers?.length
    ? filters.priceTiers
    : filters && filters.maxPriceTier < 4
      ? ([1, 2, 3, 4] as const).filter((tier) => tier <= filters.maxPriceTier)
      : [];
  if (allowedPrices.includes(restaurant.priceTier)) {
    reasons.push({ icon: "$", label: `Fits the ${"$".repeat(restaurant.priceTier)} budget` });
  }

  if (filters?.minRating && restaurant.rating && restaurant.rating >= filters.minRating) {
    reasons.push({ icon: "★", label: `${restaurant.rating}★ cleared the rating bar` });
  } else if (restaurant.rating && restaurant.rating >= 4.5) {
    reasons.push({ icon: "★", label: `${restaurant.rating}★ crowd favorite` });
  }

  reasons.push({ icon: "↗", label: distanceReason(restaurant.distanceMeters) });
  return reasons.slice(0, 4);
}
