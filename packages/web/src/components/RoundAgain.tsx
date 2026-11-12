import { Link } from "react-router-dom";

export function RoundAgain({
  isHost,
  online,
  pending,
  onAgain,
  onEditSearch,
  resultError,
}: {
  isHost: boolean;
  online: boolean;
  pending: boolean;
  onEditSearch: () => void;
  resultError?: string | null;
  onAgain: (deck: "new" | "same") => void;
}) {
  if (!isHost) {
    return (
      <Link
        to="/"
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Leave room
      </Link>
    );
  }
  return (
    <div className="round-again flex flex-col items-stretch gap-2">
      {resultError && (
        <p role="alert" className="text-sm text-flare">
          {resultError}
        </p>
      )}
      {pending && (
        <p role="status" className="text-sm text-muted">
          Updating the round…
        </p>
      )}
      <button
        type="button"
        disabled={!online || pending}
        onClick={() => onAgain("new")}
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Vote on new places
      </button>
      <button
        type="button"
        disabled={!online || pending}
        onClick={() => onAgain("same")}
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Same places, vote again
      </button>
      <button
        type="button"
        disabled={!online || pending}
        onClick={onEditSearch}
        className="min-h-11 text-sm font-semibold text-muted underline hover:text-cream"
      >
        Edit search
      </button>
    </div>
  );
}
