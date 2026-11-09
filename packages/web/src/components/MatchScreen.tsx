import { useEffect, useRef } from "react";
import { RoundAgain } from "./RoundAgain.js";
import type { SessionFilters, VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../sessionState.js";
import { VisitedHistory } from "./VisitedHistory.js";
import { WinnerScreen } from "./WinnerScreen.js";
import { PlateState } from "./PlateState.js";
export function MatchScreen({
  match,
  visited,
  filters,
  isHost,
  online,
  pending,
  demo,
  onAgain,
  onChooseAlternative,
  onNeverAgain,
}: {
  match: NonNullable<MatchState>;
  visited: VisitedPlace[];
  filters?: SessionFilters;
  isHost: boolean;
  online: boolean;
  pending: boolean;
  demo: boolean;
  onAgain: (deck: "new" | "same") => void;
  onChooseAlternative: (restaurantId: string) => void;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  if (match.kind === "none") {
    const allVetoed = match.vetoedCount > 0;
    return (
      <div className="table-panel mx-auto max-w-sm text-center">
        <PlateState art="search" />
        <h1 ref={heading} tabIndex={-1} className="mt-4 font-display text-state font-bold">
          {allVetoed ? "No eligible pick." : "No place got a yes vote."}
        </h1>
        <p className="mt-3 text-muted">
          {allVetoed
            ? `${match.vetoedCount} place${match.vetoedCount === 1 ? "" : "s"} struck off, and whatever survived, nobody wanted. Run it back with a wider net.`
            : "Try different places to give the group another choice."}
        </p>
        <div className="mt-8">
          {!isHost && <p className="mb-3 text-muted">The host can start another round.</p>}
          <RoundAgain isHost={isHost} online={online} pending={pending} onAgain={onAgain} />
        </div>
        <VisitedHistory visited={visited} onNeverAgain={onNeverAgain} />
      </div>
    );
  }

  return (
    <WinnerScreen
      match={match}
      visited={visited}
      filters={filters}
      isHost={isHost}
      online={online}
      pending={pending}
      demo={demo}
      onAgain={onAgain}
      onChooseAlternative={onChooseAlternative}
      onNeverAgain={onNeverAgain}
    />
  );
}
