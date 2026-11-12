import { useId, useLayoutEffect, useRef, useState } from "react";
import { NEIGHBORHOODS, type SessionFilters } from "@wherever/shared";
import { geocode, getLocation } from "../api.js";
import { FieldLabel, Chevron } from "./FilterControls.js";
const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";
export type LocationStatus = "idle" | "editing" | "searching";

// This sits inside the create form; submitting location must not submit the outer form.
export function LocationPicker({
  filters,
  onChange,
  onLocationStatusChange,
  deviceLocation,
  deferDeviceLocation,
}: {
  filters: SessionFilters;
  onChange: (f: SessionFilters) => void;
  onLocationStatusChange?: (status: LocationStatus) => void;
  deviceLocation?: { lat: number; lng: number } | null;
  deferDeviceLocation?: boolean;
}) {
  const errorId = useId();
  const searchId = useId();
  const hintId = `${searchId}-hint`;
  const neighborhoodsId = `${searchId}-neighborhoods`;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const searchField = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const neighborhoodsButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [nycOpen, setNycOpen] = useState(false);

  const latest = useRef({ filters, onChange });
  const request = useRef(0);
  const searching = useRef(false);
  const townEditing = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    latest.current = { filters, onChange };
  }, [filters, onChange]);
  useLayoutEffect(
    () => () => {
      request.current += 1;
      controller.current?.abort();
      onLocationStatusChange?.("idle");
    },
    [onLocationStatusChange],
  );
  function setSearchPending(pending: boolean, query = q) {
    searching.current = pending;
    setBusy(pending);
    onLocationStatusChange?.(
      pending ? "searching" : query.trim() || townEditing.current ? "editing" : "idle",
    );
  }

  function stopSearch(query = "") {
    request.current += 1;
    controller.current?.abort();
    setSearchPending(false, query);
    setErr("");
    setQ(query);
  }

  function select(next: SessionFilters) {
    townEditing.current = false;
    stopSearch();
    setEditing(false);
    setNycOpen(false);
    onChange(next);
    if (next.area) requestAnimationFrame(() => neighborhoodsButton.current?.focus());
  }

  const nearMe =
    !editing &&
    !filters.area &&
    !filters.locationLabel &&
    (deviceLocation != null || (filters.lat != null && filters.lng != null));
  const hasQuery = Boolean(q.trim());
  const activeNeighborhood =
    !editing && filters.area ? NEIGHBORHOODS.find((n) => n.value === filters.area) : undefined;
  const showLocationControls = !filters.locationLabel || editing;
  const hasSelectedPlace = Boolean(filters.locationLabel || filters.area);
  const showTownSearch = !nycOpen && (!hasSelectedPlace || editing);

  function editTown() {
    townEditing.current = true;
    stopSearch();
    setNycOpen(false);
    setEditing(true);
    requestAnimationFrame(() => searchField.current?.focus());
  }

  function toggleNeighborhoods() {
    if (nycOpen) {
      if (!activeNeighborhood) setEditing(true);
    } else {
      stopSearch(q);
    }
    setNycOpen(!nycOpen);
  }

  async function useNearMe() {
    if (searching.current || deferDeviceLocation) return;
    const version = ++request.current;
    setSearchPending(true);
    setErr("");
    try {
      const position = deviceLocation === undefined ? await getLocation() : deviceLocation;
      if (version !== request.current) return;
      if (!position) {
        setErr("Your location is unavailable. Search for a ZIP code or town instead.");
        return;
      }
      select({ ...latest.current.filters, ...position, area: undefined, locationLabel: undefined });
    } finally {
      if (version === request.current) setSearchPending(false);
    }
  }

  async function runSearch() {
    const query = q.trim();
    if (!query || searching.current) return;
    const version = ++request.current;
    setSearchPending(true);
    setErr("");
    controller.current = new AbortController();
    try {
      const hit = await geocode(query, controller.current.signal);
      if (version !== request.current) return;
      if (!hit) {
        setErr('Couldn\'t find that. Try a zip, or "Town, State".');
        return;
      }
      select({
        ...latest.current.filters,
        lat: hit.lat,
        lng: hit.lng,
        locationLabel: hit.label,
        area: undefined,
      });
      requestAnimationFrame(() => changeButton.current?.focus());
    } catch (error) {
      if (version === request.current)
        setErr(error instanceof Error ? error.message : "Location search is unavailable. Try again shortly.");
    } finally {
      if (version === request.current) setSearchPending(false);
    }
  }

  return (
    <div className="location-picker flex flex-col gap-2">
      <FieldLabel>Search area</FieldLabel>

      {filters.locationLabel && (
        <div className="flex items-center gap-2">
          <span className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-acid bg-acid/10 px-3 py-2 text-sm text-cream">
            <span aria-hidden>📍</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{filters.locationLabel}</span>
          </span>
          <button
            type="button"
            ref={changeButton}
            onClick={editTown}
            className="shrink-0 rounded-2xl border border-white/15 px-3 py-2 text-sm text-muted hover:bg-white/5"
          >
            Change
          </button>
        </div>
      )}
      <div className="location-methods">
        {showLocationControls && (
          <button
            type="button"
            aria-pressed={nearMe}
            onClick={() => void useNearMe()}
            disabled={deferDeviceLocation || busy}
            className={`min-h-11 shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
              nearMe ? "bg-acid text-ink border-acid" : "border-white/15 text-cream hover:border-white/30"
            }`}
          >
            📍 Near me
          </button>
        )}
        <button
          type="button"
          ref={neighborhoodsButton}
          aria-expanded={nycOpen}
          aria-controls={neighborhoodsId}
          onClick={toggleNeighborhoods}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-cream hover:border-white/25 transition-colors"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span>
              {activeNeighborhood ? "NYC neighborhoods" : nycOpen ? "Back to ZIP or town" : "Explore NYC"}
            </span>{" "}
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
      </div>
      {activeNeighborhood && !filters.locationLabel && !showTownSearch && (
        <button
          type="button"
          ref={changeButton}
          onClick={editTown}
          className="min-h-11 self-start text-sm text-muted underline underline-offset-4 hover:text-cream"
        >
          Search by ZIP or town
        </button>
      )}
      <div id={neighborhoodsId} hidden={!nycOpen}>
        {nycOpen && (
          <>
            <p className="mb-2 text-sm text-muted">
              {hasQuery ? "Choose a neighborhood or go back to your search." : "Choose an NYC neighborhood."}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="NYC neighborhoods">
              {NEIGHBORHOODS.map((n) => {
                const on = !editing && filters.area === n.value;
                return (
                  <button
                    key={n.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      select({
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
          </>
        )}
      </div>
      {showTownSearch && (
        <div className="flex flex-col gap-2">
          <label htmlFor={searchId} className="text-sm text-muted">
            ZIP code or town
          </label>
          <div className="flex gap-2">
            <input
              id={searchId}
              name="location"
              aria-invalid={Boolean(err)}
              aria-describedby={err ? errorId : hasQuery && !busy ? hintId : undefined}
              ref={searchField}
              type="text"
              value={q}
              onChange={(e) => stopSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // don't submit the outer create form
                  runSearch();
                }
              }}
              // Takes a town too, but the zip is the case a phone can fill for you.
              autoComplete="postal-code"
              enterKeyHint="search"
              placeholder="e.g. Denver, CO…"
              maxLength={120}
              className={`${inputClass} min-w-0 flex-1 !py-2 !text-base`}
            />
            {hasQuery && (
              <button
                type="button"
                onClick={runSearch}
                disabled={busy}
                aria-label={busy ? "Searching location" : undefined}
                className="shrink-0 rounded-2xl border border-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-50 transition"
              >
                {busy ? "Searching…" : "Search"}
              </button>
            )}
          </div>
          {hasQuery && !busy && !err && (
            <p id={hintId} className="text-sm text-muted">
              Search for this place or clear the field before continuing.
            </p>
          )}
          {(hasSelectedPlace || hasQuery) && (
            <button
              type="button"
              className="min-h-11 text-sm text-muted underline underline-offset-4"
              onClick={() => {
                townEditing.current = false;
                stopSearch();
                setEditing(false);
                requestAnimationFrame(() => (changeButton.current ?? searchField.current)?.focus());
              }}
            >
              {hasSelectedPlace ? "Cancel location change" : "Clear search"}
            </button>
          )}
        </div>
      )}
      {err && (
        <p id={errorId} role="alert" className="text-xs text-flare">
          {err}
        </p>
      )}
    </div>
  );
}
