import { useState } from "react";
import type { SessionFilters } from "@wherever/shared";
import { FilterFields } from "./FilterFields";
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
  return (
    RADIUS_OPTIONS.find((option) => option.meters === meters)?.label ?? `${Math.round(meters / 1000)} km`
  );
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
  for (const category of filters.excludedCategories ?? [])
    chips.push(`no ${cuisineLabel(category).toLowerCase()}`);
  if (filters.revealVoters) chips.push("votes shown");
  if (filters.sort === "distance") {
    const sort = SORT_OPTIONS.find((option) => option.value === "distance")?.label ?? "closest";
    chips.push(sort.toLowerCase());
  }
  chips.push(filters.categories.length > 0 ? filters.categories.map(cuisineLabel).join(", ") : "any food");
  return chips;
}

/**
 * The rules, as a sentence you can tap rather than a screen of controls.
 *
 * Everyone sees the summary; only the host can open it. The chips are the point: they say what the deck
 * will be in a way you read in one glance and mostly agree with, which is the honest shape for settings
 * that are almost always already fine.
 */
export function FilterSummary({
  filters,
  editable = false,
  onChange,
}: {
  filters: SessionFilters;
  editable?: boolean;
  onChange?: (next: SessionFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const chips = (
    <div className="flex flex-wrap justify-center gap-2">
      {filterSummaryChips(filters).map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted"
        >
          {chip}
        </span>
      ))}
    </div>
  );

  if (!editable || !onChange) return <div className="mt-6">{chips}</div>;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full rounded-2xl border border-transparent px-2 py-2 transition hover:border-white/10"
      >
        {chips}
        <span className="mt-2 block text-xs font-semibold text-muted">{open ? "done" : "change these"}</span>
      </button>
      {open && (
        <div className="mt-3 rounded-2xl border border-white/10 p-4 text-left">
          <FilterFields filters={filters} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
