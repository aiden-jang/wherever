import { Link } from "react-router-dom";

export function RoundAgain({
  isHost,
  online,
  pending,
  onAgain,
}: {
  isHost: boolean;
  online: boolean;
  pending: boolean;
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
    <div className="flex flex-col items-stretch gap-2">
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
    </div>
  );
}
