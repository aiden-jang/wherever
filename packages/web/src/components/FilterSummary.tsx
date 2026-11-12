import { useEffect, useId, useRef, useState } from "react";
import type { SessionFilters } from "@wherever/shared";
import { FilterFields } from "./FilterFields";
import { LocationPicker, type LocationStatus } from "./LocationPicker.js";
import { filterSummaryChips, searchArea } from "./filterLabels.js";
import { resolveVibe, radiusLabel, type Vibe } from "@wherever/shared";
import { useFilterHighlights } from "./useFilterHighlights.js";

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
  locked = false,
  initiallyOpen = false,
  onSavingChange,
  onChange,
  locationStatus,
  onLocationStatusChange,
  syncError,
  vibeCounts,
}: {
  locationStatus: LocationStatus;
  onLocationStatusChange: (status: LocationStatus) => void;
  filters: SessionFilters;
  editable?: boolean;
  locked?: boolean;
  initiallyOpen?: boolean;
  onSavingChange?: (saving: boolean) => void;
  onChange?: (next: SessionFilters) => boolean;
  syncError?: number;
  vibeCounts: Partial<Record<Vibe, number>>;
}) {
  const editorId = useId();
  const areaButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initiallyOpen);
  const [changingArea, setChangingArea] = useState(false);
  const [draft, setDraft] = useState<SessionFilters | null>(null);
  const pending = useRef<string[]>([]);
  useEffect(() => {
    const acknowledged = pending.current.indexOf(filterKey(filters));
    if (acknowledged >= 0) pending.current.splice(0, acknowledged + 1);
    if (!pending.current.length) {
      setDraft(null);
      onSavingChange?.(false);
    }
  }, [filters, onSavingChange]);
  useEffect(() => {
    pending.current = [];
    setDraft(null);
    onSavingChange?.(false);
  }, [editable, locked, syncError, onSavingChange]);

  function update(next: SessionFilters) {
    if (filterKey(next) === filterKey(draft ?? filters)) return;
    if (locked || !onChange?.(next)) return;
    pending.current.push(filterKey(next));
    setDraft(next);
    onSavingChange?.(true);
  }
  const active = draft ?? filters;
  const highlighted = useFilterHighlights(filters, resolveVibe(vibeCounts).vibe);
  return (
    <section className="lobby-search">
      <div className="lobby-search-row">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Dinner filters</h2>
          <p className="text-sm text-muted [overflow-wrap:anywhere]">
            {changingArea && locationStatus !== "idle"
              ? "Choose a new area"
              : `${searchArea(active)} · ${radiusLabel(active.radiusMeters)}`}
          </p>
        </div>
        {editable && onChange && (
          <button
            type="button"
            disabled={open && locationStatus !== "idle"}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={editorId}
            className="min-h-11 rounded-xl px-2 text-left text-xs font-semibold text-muted enabled:hover:bg-white/5 enabled:hover:text-cream disabled:opacity-50"
          >
            {open ? "Done editing" : "Edit dinner filters"}
          </button>
        )}
      </div>
      {editable && onChange && (
        <button
          type="button"
          disabled={locked}
          ref={areaButton}
          className="min-h-11 text-xs font-semibold text-muted underline hover:text-cream"
          onClick={() => setChangingArea((value) => !value)}
          aria-expanded={changingArea}
          aria-controls={`${editorId}-area`}
        >
          {changingArea ? "Close area settings" : "Change area"}
        </button>
      )}
      <div id={`${editorId}-area`} hidden={!changingArea || !editable}>
        {changingArea && editable && (
          <fieldset disabled={locked} className="filter-editor min-w-0">
            <LocationPicker
              filters={active}
              onLocationStatusChange={onLocationStatusChange}
              onChange={(next) => {
                update(next);
                setChangingArea(false);
                requestAnimationFrame(() => areaButton.current?.focus());
              }}
            />
          </fieldset>
        )}
      </div>
      {(!open || !editable) && (
        <ul aria-label="Dinner filters" className="mt-2 flex flex-wrap gap-1.5">
          {filterSummaryChips(active)
            .slice(1)
            .map((chip) => (
              <li
                key={chip}
                className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted [overflow-wrap:anywhere]"
              >
                {chip}
              </li>
            ))}
        </ul>
      )}
      <div id={editorId} hidden={!open || !editable}>
        {open && editable && (
          <fieldset disabled={locked} className="filter-editor min-w-0">
            <FilterFields
              filters={active}
              showLocation={false}
              highlighted={highlighted}
              onChange={update}
              onLocationStatusChange={onLocationStatusChange}
            />
          </fieldset>
        )}
      </div>
    </section>
  );
}
