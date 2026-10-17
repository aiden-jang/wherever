import { useLayoutEffect, useRef, useState } from "react";
import { NEIGHBORHOODS, isInNYC, type SessionFilters } from "@wherever/shared";
import { geocode } from "../api.js";
import { FieldLabel, Chevron } from "./FilterControls.js";
const inputClass =
  "w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors";
// This sits inside the create form; submitting location must not submit the outer form.
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

  const latest = useRef({ filters, onChange });
  const request = useRef(0);
  const searching = useRef(false);
  useLayoutEffect(() => {
    latest.current = { filters, onChange };
  }, [filters, onChange]);
  useLayoutEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  function select(next: SessionFilters) {
    request.current += 1;
    searching.current = false;
    setBusy(false);
    setErr("");
    onChange(next);
  }

  const nearMe = !filters.area && filters.lat == null;
  /* Only offer NYC shortcuts while the location is unknown or inside their coverage area. Keep a chosen neighborhood visible so it can be cleared. */
  const showNyc =
    Boolean(filters.area) || filters.lat == null || filters.lng == null || isInNYC(filters.lat, filters.lng);

  const activeNeighborhood = filters.area ? NEIGHBORHOODS.find((n) => n.value === filters.area) : undefined;

  const useNearMe = () =>
    select({ ...filters, area: undefined, lat: undefined, lng: undefined, locationLabel: undefined });

  async function runSearch() {
    const query = q.trim();
    if (!query || searching.current) return;
    searching.current = true;
    const version = ++request.current;
    setBusy(true);
    setErr("");
    const hit = await geocode(query).catch(() => null);
    if (version !== request.current) return;
    searching.current = false;
    setBusy(false);
    if (!hit) {
      setErr('Couldn\'t find that. Try a zip, or "Town, State".');
      return;
    }
    latest.current.onChange({
      ...latest.current.filters,
      lat: hit.lat,
      lng: hit.lng,
      locationLabel: hit.label,
      area: undefined,
    });
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
        // Keep the search field wide enough inside narrow filter panels.
        <div className="flex flex-col gap-2">
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
          <div className="flex gap-2">
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
              aria-label="Zip or town"
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
        </div>
      )}
      {err && (
        <p role="alert" className="text-xs text-flare">
          {err}
        </p>
      )}

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
          )}
        </div>
      )}
    </div>
  );
}
