import { useState } from "react";
import {
  AMENITY_OPTIONS,
  CUISINE_OPTIONS,
  MIN_REVIEWS_OPTIONS,
  NEIGHBORHOODS,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  RATING_OPTIONS,
  ROUND_TIMER_OPTIONS,
  SORT_OPTIONS,
  isInNYC,
  type AmenityKey,
  type PriceTier,
  type RestaurantSort,
  type SessionFilters,
} from "@wherever/shared";
import { geocode } from "../api";

const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";

const segBase = "flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors border";
const segOn = "bg-ember text-ink border-ember";
const segOff = "bg-black/40 text-cream border-white/10 hover:border-white/30";

/**
 * The knobs, in the lobby rather than the create modal. One person answering eight questions alone
 * before anybody joined was a strange opening for an app whose pitch is that deciding is exhausting.
 */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

/*
 * The whole "where" control: "Near me" beside a zip/town search, with the NYC shortcuts behind a
 * fold so the form is not a wall of chips. Geocoding runs on submit through the Worker and writes the
 * centre into `filters.lat/lng`.
 *
 * Lives inside the outer create `<form>`, so Enter is caught here and must not submit that one.
 */
export function LocationPicker({
  filters,
  onChange,
}: {
  filters: SessionFilters;
  onChange: (f: SessionFilters) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Start expanded only if a neighborhood is already chosen, so the active pick is visible.
  const [nycOpen, setNycOpen] = useState(Boolean(filters.area));

  const nearMe = !filters.area && filters.lat == null;
  /*
   * The shortcuts are Manhattan and Brooklyn, so somebody who searched "Denver, CO" was being offered
   * Williamsburg. `isInNYC` was written for exactly this and called nowhere.
   *
   * Shown while the location is unknown, which is what "near me" means here - the browser resolves
   * coordinates at search time, so there is nothing yet to rule the group out on - and always once a
   * neighbourhood is picked, or choosing one would hide the way to undo it.
   */
  const showNyc =
    Boolean(filters.area) || filters.lat == null || filters.lng == null || isInNYC(filters.lat, filters.lng);

  const activeNeighborhood = filters.area ? NEIGHBORHOODS.find((n) => n.value === filters.area) : undefined;

  const useNearMe = () =>
    onChange({ ...filters, area: undefined, lat: undefined, lng: undefined, locationLabel: undefined });

  async function runSearch() {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setErr("");
    const hit = await geocode(query);
    setBusy(false);
    if (!hit) {
      setErr('Couldn\'t find that. Try a zip, or "Town, State".');
      return;
    }
    onChange({ ...filters, lat: hit.lat, lng: hit.lng, locationLabel: hit.label, area: undefined });
    setQ("");
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Where, geographically</FieldLabel>

      {filters.locationLabel ? (
        // A searched place is active: show it as a chip with a way back to "Near me".
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-acid bg-acid/10 px-3 py-2 text-sm text-cream">
            <span aria-hidden>📍</span>
            <span className="truncate">{filters.locationLabel}</span>
          </span>
          <button
            type="button"
            onClick={useNearMe}
            className="shrink-0 rounded-2xl border border-white/15 px-3 py-2 text-sm text-muted hover:bg-white/5"
          >
            Change
          </button>
        </div>
      ) : (
        // Consolidated row: "Near me" beside the zip/town search.
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={nearMe}
            onClick={useNearMe}
            className={`shrink-0 rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${
              nearMe ? "bg-acid text-ink border-acid" : "border-white/15 text-cream hover:border-white/30"
            }`}
          >
            📍 Near me
          </button>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // don't submit the outer create form
                runSearch();
              }
            }}
            // Takes a town too, but the zip is the case a phone can fill for you.
            autoComplete="postal-code"
            enterKeyHint="search"
            placeholder="Zip or town"
            maxLength={120}
            className={`${inputClass} min-w-0 flex-1 !py-2 !text-base`}
          />
          {q.trim() && (
            <button
              type="button"
              onClick={runSearch}
              disabled={busy}
              className="shrink-0 rounded-2xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50 transition"
            >
              {busy ? "..." : "Go"}
            </button>
          )}
        </div>
      )}
      {err && <p className="text-xs text-flare">{err}</p>}

      {/* NYC neighborhood shortcuts, collapsed by default, and only where they mean anything. */}
      {showNyc && (
        <div>
          <button
            type="button"
            aria-expanded={nycOpen}
            onClick={() => setNycOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-sm text-cream hover:border-white/25 transition-colors"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted">NYC neighborhoods</span>
              {activeNeighborhood && (
                <span className="shrink-0 rounded-full bg-acid px-2 py-0.5 text-xs font-bold text-ink">
                  {activeNeighborhood.label}
                </span>
              )}
            </span>
            <span className="shrink-0 text-muted">
              <Chevron open={nycOpen} />
            </span>
          </button>
          {nycOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              {NEIGHBORHOODS.map((n) => {
                const on = filters.area === n.value;
                return (
                  <button
                    key={n.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      onChange({
                        ...filters,
                        area: n.value,
                        lat: undefined,
                        lng: undefined,
                        locationLabel: undefined,
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      on
                        ? "bg-acid text-ink border-acid font-semibold"
                        : "border-white/10 text-cream hover:border-white/30"
                    }`}
                  >
                    {n.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

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
  const [rulesOpen, setRulesOpen] = useState(false);

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

  // "House rules" = how the round runs (reveal voters + timer), folded away from the food filters.
  const rulesCount = (filters.revealVoters ? 1 : 0) + (filters.roundSeconds ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
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
        <div className="flex gap-2">
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
        <div className="flex gap-2">
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
        <div className="flex gap-2">
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
        <div className="flex gap-2">
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

      {/* How the round runs — reveal-voters + timer. Separate from the food filters so the form
          reads as "what to eat" then "how we decide", not one long settings wall. */}
      <div className="rounded-2xl border border-white/10">
        <button
          type="button"
          aria-expanded={rulesOpen}
          onClick={() => setRulesOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-semibold">House rules</span>
            {rulesCount > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-ember px-2 py-0.5 text-xs font-bold text-ink">
                {rulesCount} on
              </span>
            )}
            <span className="hidden truncate text-xs text-muted sm:inline">timer, who's voted</span>
          </span>
          <Chevron open={rulesOpen} />
        </button>

        {rulesOpen && (
          <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4">
            <button
              type="button"
              aria-pressed={filters.revealVoters ?? false}
              onClick={() => onChange({ ...filters, revealVoters: !filters.revealVoters })}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                filters.revealVoters ? "border-ember bg-ember/10" : "border-white/10 hover:border-white/30"
              }`}
            >
              <span className="flex flex-col">
                <span className="font-semibold">Show who's voted</span>
                <span className="text-xs text-muted">
                  {filters.revealVoters ? "Everyone sees who's finished" : "Off. Votes stay anonymous"}
                </span>
              </span>
              <span
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  filters.revealVoters ? "bg-ember" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    filters.revealVoters ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>

            <div className="flex flex-col gap-2">
              <FieldLabel>Round timer</FieldLabel>
              <div className="flex gap-2">
                {ROUND_TIMER_OPTIONS.map((o) => {
                  const on = (filters.roundSeconds ?? 0) === o.seconds;
                  return (
                    <button
                      key={o.seconds}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange({ ...filters, roundSeconds: o.seconds })}
                      className={`${segBase} ${on ? segOn : segOff}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-muted">
                {(filters.roundSeconds ?? 0) === 0
                  ? "No timer. Decide when everyone's done"
                  : "When time's up, the votes so far decide"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
