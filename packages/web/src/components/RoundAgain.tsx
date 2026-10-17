import { useNavigate } from "react-router-dom";

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
        className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold transition hover:bg-white/5"
      >
        Same places, vote again
      </button>
    </div>
  );
}
