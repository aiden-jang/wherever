import { useId } from "react";
import type { SessionFilters } from "@wherever/shared";
import type { LocationStatus } from "./LocationPicker.js";
import { filterSummaryChips } from "./filterLabels.js";

export function LobbyStart({
  filters,
  starting,
  locationStatus,
  saving,
  online,
  count,
  onStart,
}: {
  filters: SessionFilters;
  starting: boolean;
  locationStatus: LocationStatus;
  saving: boolean;
  online: boolean;
  count: number;
  onStart: () => void;
}) {
  const summaryId = useId();
  const pending = starting || locationStatus !== "idle" || saving || !online;
  const summary = filterSummaryChips(filters);
  const status = !online
    ? "Reconnecting…"
    : locationStatus !== "idle"
      ? "Finish choosing an area"
      : saving
        ? "Saving filters…"
        : summary[0];
  return (
    <section className="lobby-start-bar" aria-label="Start the round">
      <div className="lobby-start-summary" id={summaryId}>
        <p className="text-sm font-semibold [overflow-wrap:anywhere]">{status}</p>
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          {count} {count === 1 ? "person" : "people"} · {summary.slice(1, 3).join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={onStart}
        aria-describedby={summaryId}
        disabled={pending}
        className="lobby-start rounded-xl bg-ember px-4 py-3 font-semibold text-ink hover:brightness-110 disabled:opacity-60"
      >
        {starting ? "Finding places…" : "Start swiping"}
      </button>
    </section>
  );
}
