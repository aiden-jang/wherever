import { useNavigate } from "react-router-dom";

/*
 * What the room can do once it has an answer.
 *
 * Two ways for the host to disagree with the result, because there are two things that can be
 * wrong: the list, or the vote. New places costs a Places fetch and is capped; the same list is
 * free, so re-running a close vote is not rationed. Everyone else gets the door.
 */
export function RoundAgain({
  isHost,
  onAgain,
}: {
  isHost: boolean;
  onAgain: (deck: "new" | "same") => void;
}) {
  const navigate = useNavigate();
  if (!isHost) {
    return (
      <button
        onClick={() => navigate("/")}
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Show myself out
      </button>
    );
  }
  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        onClick={() => onAgain("new")}
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Run it back, new places
      </button>
      <button
        onClick={() => onAgain("same")}
        className="rounded-full px-8 py-2 text-sm font-semibold text-muted transition hover:text-cream"
      >
        Same places, vote again
      </button>
    </div>
  );
}
