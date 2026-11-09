import { useEffect, useRef, useState } from "react";
import type { SessionFilters } from "@wherever/shared";
import { FilterFields } from "./FilterFields";
import {
  amenityLabel,
  cuisineLabel,
  neighborhoodLabel,
  PRICE_OPTIONS,
  radiusLabel,
  ROUND_TIMER_OPTIONS,
  SORT_OPTIONS,
} from "@wherever/shared";

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
  if (filters.sort === "distance") {
    const sort = SORT_OPTIONS.find((option) => option.value === "distance")?.label ?? "closest";
    chips.push(sort.toLowerCase());
  }
  chips.push(filters.categories.length > 0 ? filters.categories.map(cuisineLabel).join(", ") : "any food");
  return chips;
}

function filterKey(filters: SessionFilters): string {
  return JSON.stringify(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function FilterSummary({
  filters,
  editable = false,
  onChange,
  onSearchPendingChange,
  syncError,
}: {
  onSearchPendingChange?: (pending: boolean) => void;
  filters: SessionFilters;
  editable?: boolean;
  onChange?: (next: SessionFilters) => void;
  syncError?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SessionFilters | null>(null);
  const pending = useRef<string[]>([]);
  useEffect(() => {
    const acknowledged = pending.current.indexOf(filterKey(filters));
    if (acknowledged >= 0) pending.current.splice(0, acknowledged + 1);
    if (!pending.current.length) setDraft(null);
  }, [filters]);
  useEffect(() => {
    pending.current = [];
    setDraft(null);
  }, [editable, syncError]);

  function update(next: SessionFilters) {
    if (filterKey(next) === filterKey(draft ?? filters)) return;
    pending.current.push(filterKey(next));
    setDraft(next);
    onChange?.(next);
  }
  const chips = (
    <div className="flex flex-wrap justify-center gap-2">
      {filterSummaryChips(draft ?? filters).map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted"
        >
          {chip}
        </span>
      ))}
    </div>
  );

  if (!editable || !onChange) return <div className="filter-summary mt-6">{chips}</div>;

  return (
    <div className="filter-summary mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full rounded-2xl border border-transparent px-2 py-2 transition hover:border-white/10"
      >
        {chips}
        <span className="mt-2 block text-xs font-semibold text-muted">
          {open ? "Done editing" : "Edit dinner filters"}
        </span>
      </button>
      {open && (
        <div className="filter-editor mt-3 rounded-2xl border border-white/10 p-4 text-left">
          <FilterFields
            filters={draft ?? filters}
            onChange={update}
            onSearchPendingChange={onSearchPendingChange}
          />
        </div>
      )}
    </div>
  );
}
