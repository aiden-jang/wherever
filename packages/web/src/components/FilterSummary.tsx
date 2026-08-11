import type { SessionFilters } from "@wherever/shared";
import {
  amenityLabel,
  cuisineLabel,
  neighborhoodLabel,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  ROUND_TIMER_OPTIONS,
  SORT_OPTIONS,
} from "@wherever/shared";

function radiusLabel(meters: number): string {
  return RADIUS_OPTIONS.find((option) => option.meters === meters)?.label ?? `${Math.round(meters / 1000)} km`;
}

/** Human-sized evidence of the rules a restaurant survived. */
export function filterSummaryChips(filters: SessionFilters): string[] {
  const place = filters.locationLabel ?? (filters.area ? neighborhoodLabel(filters.area) : undefined);
  const chips: string[] = [
    place ? `${place} · ${radiusLabel(filters.radiusMeters)}` : radiusLabel(filters.radiusMeters),
  ];
  const priceLabelFor = (tier: number) => PRICE_OPTIONS.find((option) => option.tier === tier)?.label ?? "$";
  if (filters.priceTiers && filters.priceTiers.length > 0) {
    chips.push(filters.priceTiers.map(priceLabelFor).join(", "));
  } else if (filters.maxPriceTier < 4) {
    chips.push(`up to ${priceLabelFor(filters.maxPriceTier)}`);
  }
  if (filters.minRating && filters.minRating > 0) chips.push(`${filters.minRating.toFixed(1)}+ stars`);
  if (filters.minReviews && filters.minReviews > 0) chips.push(`${filters.minReviews}+ reviews`);
  if (filters.openNow) chips.push("open now");
  if (filters.roundSeconds) {
    const timer = ROUND_TIMER_OPTIONS.find((option) => option.seconds === filters.roundSeconds)?.label;
    chips.push(`${(timer ?? `${filters.roundSeconds}s`).toLowerCase()} timer`);
  }
  for (const amenity of filters.amenities ?? []) chips.push(amenityLabel(amenity).toLowerCase());
  for (const category of filters.excludedCategories ?? []) chips.push(`no ${cuisineLabel(category).toLowerCase()}`);
  if (filters.revealVoters) chips.push("votes shown");
  if (filters.sort === "distance") {
    const sort = SORT_OPTIONS.find((option) => option.value === "distance")?.label ?? "closest";
    chips.push(sort.toLowerCase());
  }
  chips.push(filters.categories.length > 0 ? filters.categories.map(cuisineLabel).join(", ") : "any food");
  return chips;
}

/** Read-only recap shown while the group is gathering. */
export function FilterSummary({ filters }: { filters: SessionFilters }) {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {filterSummaryChips(filters).map((chip) => (
        <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted">
          {chip}
        </span>
      ))}
    </div>
  );
}
