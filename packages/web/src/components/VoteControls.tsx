import type { Restaurant, SwipeDirection } from "@wherever/shared";
import type { ReactNode } from "react";

export function VoteControls({
  disabled,
  detailsStatus,
  vetoUsed,
  superUsed,
  onVote,
  onSpent,
  undo,
}: {
  disabled: boolean;
  detailsStatus?: Restaurant["detailsStatus"];
  vetoUsed: boolean;
  superUsed: boolean;
  onVote: (direction: SwipeDirection, superLike?: boolean, veto?: boolean) => void;
  onSpent: (key: "vetoSpent" | "superSpent") => void;
  undo: ReactNode;
}) {
  return (
    <div className="vote-controls">
      <div className="vote-main">
        <button
          data-deck-control
          type="button"
          disabled={disabled || detailsStatus === "pending"}
          onClick={() => onVote("left")}
          className="vote-no"
        >
          <span aria-hidden>✕</span> {detailsStatus === "unavailable" ? "Skip this place" : "Nope"}
        </button>
        <button
          data-deck-control
          type="button"
          disabled={disabled || Boolean(detailsStatus)}
          onClick={() => onVote("right")}
          className="vote-yes"
        >
          <span aria-hidden>♥</span> Yes, please
        </button>
      </div>
      {undo && <div className="text-center">{undo}</div>}
      <div className="vote-special">
        <button
          data-deck-control
          type="button"
          disabled={disabled || Boolean(detailsStatus)}
          aria-disabled={vetoUsed}
          aria-label={vetoUsed ? "Veto, already used this round" : "Veto (one per round, kills it outright)"}
          onClick={() => (vetoUsed ? onSpent("vetoSpent") : onVote("left", false, true))}
        >
          <span aria-hidden>⊘</span> Veto <small>{vetoUsed ? "Used" : "1 left"}</small>
        </button>
        <button
          data-deck-control
          type="button"
          disabled={disabled || Boolean(detailsStatus)}
          aria-disabled={superUsed}
          aria-label={superUsed ? "Super-like, already used this round" : "Super-like (one per round)"}
          onClick={() => (superUsed ? onSpent("superSpent") : onVote("right", true))}
        >
          <span aria-hidden>✦</span> Super-like <small>{superUsed ? "Used" : "1 left"}</small>
        </button>
      </div>
    </div>
  );
}
