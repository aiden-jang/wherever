import { useState } from "react";
import {
  AMENITY_OPTIONS,
  CUISINE_OPTIONS,
  MIN_REVIEWS_OPTIONS,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  RATING_OPTIONS,
  SORT_OPTIONS,
  type AmenityKey,
  type PriceTier,
  type RestaurantSort,
  type SessionFilters,
} from "@wherever/shared";

import { FieldLabel, Chevron, segBase, segOn, segOff } from "./FilterControls.js";
import { LocationPicker } from "./LocationPicker.js";
import { RoundRules } from "./RoundRules.js";
/**
 * Cuisine multi-select + distance / price / open-now up front, with rating / min-reviews / sort
 * tucked behind a collapsible "get picky" disclosure. The app's whole premise is that deciding is
 * exhausting, so the create form leads with the few choices a group actually cares about and hides
 * the power-user knobs until asked. Empty cuisine = anything.
 */
export function FilterFields({
  filters,
  onChange,
}: {
  filters: SessionFilters;
  onChange: (next: SessionFilters) => void;
}) {
  const [pickyOpen, setPickyOpen] = useState(false);

  const popularCuisines = CUISINE_OPTIONS.filter((c) => c.popular);
  const moreCuisines = CUISINE_OPTIONS.filter((c) => !c.popular);
  // Auto-expand the full list if a selected cuisine lives in the hidden set, so a pick can never be
  // silently tucked away out of view.
  const hasHiddenSelected = moreCuisines.some((c) => filters.categories.includes(c.value));
  const [showAllCuisines, setShowAllCuisines] = useState(hasHiddenSelected);

  function toggleCuisine(value: string) {
    const has = filters.categories.includes(value);
    onChange({
      ...filters,
      categories: has ? filters.categories.filter((c) => c !== value) : [...filters.categories, value],
    });
  }

  function toggleAmenity(key: AmenityKey) {
    const current = filters.amenities ?? [];
    const has = current.includes(key);
    onChange({
      ...filters,
      amenities: has ? current.filter((a) => a !== key) : [...current, key],
    });
  }

  function togglePrice(tier: PriceTier) {
    const current = filters.priceTiers ?? [];
    const has = current.includes(tier);
    onChange({
      ...filters,
      priceTiers: has ? current.filter((t) => t !== tier) : [...current, tier].sort(),
    });
  }

  function toggleExclude(value: string) {
    const current = filters.excludedCategories ?? [];
    const has = current.includes(value);
    onChange({
      ...filters,
      excludedCategories: has ? current.filter((c) => c !== value) : [...current, value],
    });
  }

  // How many hidden knobs are set away from their defaults, so a collapsed section still tells the
  // host something's active under there. (Rating + review-count moved out to the main filters.)
  const pickyCount =
    ((filters.sort ?? "popularity") !== "popularity" ? 1 : 0) +
    (filters.amenities?.length ?? 0) +
    (filters.excludedCategories?.length ?? 0);

  return (
    <div className="filter-fields flex flex-col gap-4">
      <LocationPicker filters={filters} onChange={onChange} />

      <div className="flex flex-col gap-2">
        <FieldLabel>Cravings (pick some, or leave it to fate)</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(showAllCuisines ? CUISINE_OPTIONS : popularCuisines).map((c) => {
            const on = filters.categories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleCuisine(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on
                    ? "bg-acid text-ink border-acid font-semibold"
                    : "border-white/10 text-cream hover:border-white/30"
                }`}
              >
                <span className="mr-1">{c.emoji}</span>
                {c.label}
              </button>
            );
          })}
          {!showAllCuisines && (
            <button
              type="button"
              onClick={() => setShowAllCuisines(true)}
              className="rounded-full border border-dashed border-white/20 px-3 py-1.5 text-sm text-muted hover:border-white/40 hover:text-cream transition-colors"
            >
              + {moreCuisines.length} more
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>How far you'll actually go</FieldLabel>
        <div className="filter-options gap-2">
          {RADIUS_OPTIONS.map((o) => (
            <button
              key={o.meters}
              type="button"
              aria-pressed={filters.radiusMeters === o.meters}
              onClick={() => onChange({ ...filters, radiusMeters: o.meters })}
              className={`${segBase} ${filters.radiusMeters === o.meters ? segOn : segOff}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Budget, realistically</FieldLabel>
        <div className="filter-options gap-2">
          {PRICE_OPTIONS.map((o) => {
            const on = (filters.priceTiers ?? []).includes(o.tier as PriceTier);
            return (
              <button
                key={o.tier}
                type="button"
                aria-pressed={on}
                onClick={() => togglePrice(o.tier as PriceTier)}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted">
          {(filters.priceTiers?.length ?? 0) === 0
            ? "Any price. Tap to pick exact levels"
            : "Only the levels you picked"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Standards</FieldLabel>
        <div className="filter-options gap-2">
          {RATING_OPTIONS.map((o) => {
            const on = (filters.minRating ?? 0) === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, minRating: o.value })}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel>Enough reviews to trust it</FieldLabel>
        <div className="filter-options gap-2">
          {MIN_REVIEWS_OPTIONS.map((o) => {
            const on = (filters.minReviews ?? 0) === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, minReviews: o.value })}
                className={`${segBase} ${on ? segOn : segOff}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        aria-pressed={filters.openNow ?? false}
        onClick={() => onChange({ ...filters, openNow: !filters.openNow })}
        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
          filters.openNow ? "border-ember bg-ember/10" : "border-white/10 hover:border-white/30"
        }`}
      >
        <span className="flex flex-col">
          <span className="font-semibold">Open now</span>
          <span className="text-xs text-muted">Hide places that are closed right now</span>
        </span>
        <span
          className={`relative h-6 w-11 rounded-full transition-colors ${
            filters.openNow ? "bg-ember" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              filters.openNow ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>

      {/* Power-user knobs most groups never touch, folded away so the form leads with the choices
          that actually matter. A count keeps them discoverable when set. */}
      <div className="rounded-2xl border border-white/10">
        <button
          type="button"
          aria-expanded={pickyOpen}
          onClick={() => setPickyOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold">Get picky</span>
            {pickyCount > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-ink">
                {pickyCount} on
              </span>
            )}
            <span className="hidden truncate text-xs text-muted sm:inline">amenities, excludes, sort</span>
          </span>
          <Chevron open={pickyOpen} />
        </button>

        {pickyOpen && (
          <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4">
            <div className="flex flex-col gap-2">
              <FieldLabel>Must-haves</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {AMENITY_OPTIONS.map((a) => {
                  const on = (filters.amenities ?? []).includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAmenity(a.key)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? "bg-acid text-ink border-acid font-semibold"
                          : "border-white/10 text-cream hover:border-white/30"
                      }`}
                    >
                      <span className="mr-1">{a.emoji}</span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Not tonight</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {popularCuisines.map((c) => {
                  const on = (filters.excludedCategories ?? []).includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleExclude(c.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? "bg-flare text-ink border-flare font-semibold"
                          : "border-white/10 text-cream hover:border-white/30"
                      }`}
                    >
                      <span className="mr-1">{c.emoji}</span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-muted">Anything you tap here won't show up.</span>
            </div>

            <div className="flex flex-col gap-2">
              <FieldLabel>Order by</FieldLabel>
              <div className="flex gap-2">
                {SORT_OPTIONS.map((o) => {
                  const on = (filters.sort ?? "popularity") === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ ...filters, sort: o.value as RestaurantSort })}
                      className={`${segBase} ${on ? segOn : segOff}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <RoundRules filters={filters} onChange={onChange} />
    </div>
  );
}
