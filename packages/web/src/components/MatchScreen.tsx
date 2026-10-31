import { useNavigate } from "react-router-dom";
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
  onAgain,
  onChooseAlternative,
  onNeverAgain,
}: {
  match: NonNullable<MatchState>;
  visited: VisitedPlace[];
  filters?: SessionFilters;
  isHost: boolean;
  onAgain: (deck: "new" | "same") => void;
  onChooseAlternative: (restaurantId: string) => void;
  onNeverAgain: (restaurantId: string, neverAgain: boolean) => void;
}) {
  const navigate = useNavigate();

  if (match.kind === "none") {
    // Two very different rounds end here, and saying "nobody liked anything" about the second one
    // is just false — people wanted things, and every one of them got vetoed. That is also the
    // case where somebody most wants to know what actually happened to their pick.
    const allVetoed = match.vetoedCount > 0;
    return (
      <div className="text-center max-w-sm mx-auto">
        <PlateState art="search" />
        <h1 className="mt-4 font-display text-state font-bold">
          {allVetoed ? "Everything got vetoed." : "Nobody liked anything."}
        </h1>
        <p className="mt-3 text-muted">
          {allVetoed
            ? `${match.vetoedCount} place${match.vetoedCount === 1 ? "" : "s"} struck off, and whatever survived, nobody wanted. Run it back with a wider net.`
            : "A clean sweep of nos. Genuinely impressive. Cereal is still on the table, spiritually."}
        </p>
        {isHost ? (
          <button
            onClick={() => onAgain("new")}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Run it back
          </button>
        ) : (
          /* A guest cannot start another round, so both result branches offer a way home. */
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="text-muted">Round two is the host&rsquo;s call.</p>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
            >
              Show myself out
            </button>
          </div>
        )}
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
      onAgain={onAgain}
      onChooseAlternative={onChooseAlternative}
      onNeverAgain={onNeverAgain}
    />
  );
}
