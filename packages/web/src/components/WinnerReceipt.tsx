import { line, matchReasons, nearMissLine, type SessionFilters } from "@wherever/shared";
import type { MatchState } from "../sessionState.js";
import { filterSummaryChips } from "./filterLabels.js";
import { VerdictNotes } from "./VerdictNotes.js";
import { seedFrom, consensusLine } from "./winnerCopy.js";

export function WinnerReceipt({
  match,
  filters,
}: {
  match: Extract<NonNullable<MatchState>, { kind: "match" }>;
  filters?: SessionFilters;
}) {
  const {
    restaurant,
    rightSwipes,
    totalParticipants,
    alternatives,
    hostPicked = false,
    tiedWith = 0,
    vetoedTop = false,
    vetoedCount,
    superTipped,
    round,
  } = match;
  const nearMiss = hostPicked ? null : nearMissLine(restaurant.name, rightSwipes, alternatives);
  const reasons = matchReasons(restaurant, filters, rightSwipes, totalParticipants, hostPicked);
  return (
    <details className="winner-disclosure">
      <summary>Decision receipt</summary>
      <div className="winner-detail-content">
        <p className="text-sm font-semibold">
          {hostPicked
            ? "The host chose this backup."
            : tiedWith > 0 && totalParticipants > 1
              ? line("tie", seedFrom(restaurant.id))
              : consensusLine(rightSwipes, totalParticipants, seedFrom(restaurant.id))}
        </p>
        {tiedWith > 0 && (
          <p className="mt-2 text-xs text-muted">
            {tiedWith + 1} places tied on points. This one appeared first in the deck.
          </p>
        )}
        {tiedWith === 0 && nearMiss && <p className="mt-2 text-xs text-muted">{nearMiss}</p>}
        {vetoedTop && <p className="mt-2 text-xs text-flare">Something scored higher. Somebody vetoed it.</p>}
        <VerdictNotes vetoedCount={vetoedCount} superTipped={superTipped} round={round} />
        <h3 className="mt-4 text-sm font-semibold">Why this one works</h3>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          {reasons.map((reason) => (
            <li key={reason.label}>
              <span aria-hidden>{reason.icon}</span> {reason.label}
            </li>
          ))}
        </ul>
        {filters && (
          <ul aria-label="Applied dinner filters" className="mt-4 flex flex-wrap gap-2">
            {filterSummaryChips(filters).map((chip) => (
              <li key={chip} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted">
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
