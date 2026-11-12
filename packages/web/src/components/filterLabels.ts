import type { SessionFilters } from "@wherever/shared";
import {
  amenityLabel,
  cuisineLabel,
  neighborhoodLabel,
  PRICE_OPTIONS,
  radiusLabel,
  ROUND_TIMER_OPTIONS,
  SORT_OPTIONS,
} from "@wherever/shared";

export function searchArea(filters: SessionFilters): string {
  return (
    filters.locationLabel ??
    (filters.area ? neighborhoodLabel(filters.area) : undefined) ??
    (filters.lat != null && filters.lng != null ? "Current location" : "New York City")
  );
}

/** Human-sized evidence of the rules a restaurant survived. */
export function filterSummaryChips(filters: SessionFilters): string[] {
  const chips = [`${searchArea(filters)} · ${radiusLabel(filters.radiusMeters)}`];
  const priceLabelFor = (tier: number) => PRICE_OPTIONS.find((option) => option.tier === tier)?.label ?? "$";
  if (filters.priceTiers && filters.priceTiers.length > 0) {
    chips.push(filters.priceTiers.map(priceLabelFor).join(", "));
  } else if (filters.maxPriceTier < 4) {
    chips.push(`up to ${priceLabelFor(filters.maxPriceTier)}`);
  }
  if (filters.minRating && filters.minRating > 0)
    chips.push(
      `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(filters.minRating)}+ stars`,
    );
  if (filters.minReviews && filters.minReviews > 0)
    chips.push(`${new Intl.NumberFormat().format(filters.minReviews)}+ reviews`);
  if (filters.openNow) chips.push("open now");
  if (filters.roundSeconds) {
    const timer = ROUND_TIMER_OPTIONS.find((option) => option.seconds === filters.roundSeconds)?.label;
    chips.push(`${(timer ?? `${filters.roundSeconds}s`).toLowerCase()} timer`);
  }
  for (const amenity of filters.amenities ?? []) chips.push(amenityLabel(amenity).toLowerCase());
  for (const category of filters.excludedCategories ?? [])
    chips.push(`no ${cuisineLabel(category).toLowerCase()}`);
  if (filters.revealVoters) chips.push("completion shown");
  if (filters.shuffle) chips.push("shuffled");
  if (!filters.shuffle && filters.sort === "distance") {
    const sort = SORT_OPTIONS.find((option) => option.value === "distance")?.label ?? "closest";
    chips.push(sort.toLowerCase());
  }
  chips.push(filters.categories.length > 0 ? filters.categories.map(cuisineLabel).join(", ") : "any food");
  return chips;
}
