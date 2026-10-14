import { useState } from "react";
import { ROUND_TIMER_OPTIONS, type SessionFilters } from "@wherever/shared";
import { FieldLabel, Chevron, segBase, segOn, segOff } from "./FilterControls.js";
export function RoundRules({
  filters,
  onChange,
}: {
  filters: SessionFilters;
  onChange: (next: SessionFilters) => void;
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesCount = (filters.revealVoters ? 1 : 0) + (filters.roundSeconds ? 1 : 0);
  return (
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
        <div className="round-rule-fields flex flex-col gap-4 border-t border-white/10 px-4 py-4">
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
            <div className="filter-options gap-2">
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
  );
}
