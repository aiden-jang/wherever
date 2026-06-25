import { useNavigate } from "react-router-dom";
import type { MatchState } from "../useSessionSocket.js";
import { distanceLabel, priceLabel, styleFor } from "./cardStyle.js";

export function MatchScreen({ match }: { match: NonNullable<MatchState> }) {
  const navigate = useNavigate();

  if (match.kind === "none") {
    return (
      <div className="text-center max-w-sm mx-auto">
        <div className="text-6xl">🤷</div>
        <h1 className="mt-4 font-display text-4xl font-bold">Nobody liked anything.</h1>
        <p className="mt-3 text-muted">
          Genuinely impressive. You all swiped left on dinner. Maybe cereal.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
        >
          Try again, pickier this time
        </button>
      </div>
    );
  }

  const { restaurant, rightSwipes, totalParticipants } = match;
  const s = styleFor(restaurant.category);

  function share() {
    const text = `We're eating at ${restaurant.name}. Decided by swipe, not by group chat.`;
    if (navigator.share) {
      navigator.share({ title: "Wherever, Honestly", text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
    }
  }

  return (
    <div className="text-center max-w-sm mx-auto w-full">
      <p className="font-display text-lg font-bold tracking-widest text-acid uppercase">
        It&apos;s decided
      </p>
      <div className="mt-5 rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
        <div
          className="h-44 flex items-center justify-center text-7xl"
          style={{ background: restaurant.imageUrl ? undefined : s.gradient }}
        >
          {restaurant.imageUrl ? (
            <img src={restaurant.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="drop-shadow-lg">{s.emoji}</span>
          )}
        </div>
        <div className="p-5">
          <div className="font-display text-3xl font-extrabold leading-tight">
            {restaurant.name}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-sm text-muted">
            <span>{restaurant.category}</span>
            <span className="text-white/20">|</span>
            <span className="text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
            </span>
            <span className="text-white/20">|</span>
            <span>{priceLabel(restaurant.priceTier)}</span>
            <span className="text-white/20">|</span>
            <span>{distanceLabel(restaurant.distanceMeters)}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-muted">
        {rightSwipes} of {totalParticipants} wanted it. Democracy works.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={share}
          className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
        >
          Tell the group it&apos;s settled
        </button>
        <button
          onClick={() => navigate("/")}
          className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
        >
          Start another
        </button>
      </div>
    </div>
  );
}
