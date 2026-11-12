import { useState } from "react";
import { ROUND_TIMER_OPTIONS, type SessionFilters } from "@wherever/shared";
import { Chevron, FilterChoices } from "./FilterControls.js";
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
              filters.revealVoters ? "border-acid bg-acid/10" : "border-white/10 hover:border-white/30"
            }`}
          >
            <span className="flex flex-col">
              <span className="font-semibold">Show who's voted</span>
              <span className="text-xs text-muted">
                {filters.revealVoters
                  ? "Everyone sees who's finished"
                  : "Off. Individual ballots stay hidden"}
              </span>
            </span>
            <span
              className={`relative h-6 w-11 rounded-full transition-colors ${
                filters.revealVoters ? "bg-acid" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
                  filters.revealVoters ? "translate-x-[22px] bg-ink" : "translate-x-0.5 bg-white"
                }`}
              />
            </span>
          </button>

          <div className="flex flex-col gap-2">
            <FilterChoices
              label="Round timer"
              options={ROUND_TIMER_OPTIONS.map(({ seconds: value, label }) => ({ value, label }))}
              value={filters.roundSeconds ?? 0}
              onChange={(roundSeconds) => onChange({ ...filters, roundSeconds })}
            />
            <span className="text-xs text-muted">
              {(filters.roundSeconds ?? 0) === 0
                ? "No timer. Decide when everyone's done"
                : "When time’s up, the votes so far decide. Anyone can turn off the timer."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
