import type { SwipeDirection } from "@wherever/shared";

export function VoteControls({
  vetoUsed,
  superUsed,
  onVote,
  onSpent,
}: {
  vetoUsed: boolean;
  superUsed: boolean;
  onVote: (direction: SwipeDirection, superLike?: boolean, veto?: boolean) => void;
  onSpent: (key: "vetoSpent" | "superSpent") => void;
}) {
  return (
    <div className="vote-controls">
      <div className="vote-main">
        <button type="button" onClick={() => onVote("left")} className="vote-no">
          <span aria-hidden>✕</span> Nope
        </button>
        <button type="button" onClick={() => onVote("right")} className="vote-yes">
          <span aria-hidden>♥</span> Yes, please
        </button>
      </div>
      <div className="vote-special">
        <button
          type="button"
          aria-disabled={vetoUsed}
          aria-label={vetoUsed ? "Veto, already used this round" : "Veto (one per round, kills it outright)"}
          onClick={() => (vetoUsed ? onSpent("vetoSpent") : onVote("left", false, true))}
        >
          <span aria-hidden>⊘</span> Veto <small>{vetoUsed ? "Used" : "1 per round"}</small>
        </button>
        <button
          type="button"
          aria-disabled={superUsed}
          aria-label={superUsed ? "Super-like, already used this round" : "Super-like (one per round)"}
          onClick={() => (superUsed ? onSpent("superSpent") : onVote("right", true))}
        >
          <span aria-hidden>✦</span> Super-like <small>{superUsed ? "Used" : "1 per round"}</small>
        </button>
      </div>
    </div>
  );
}
