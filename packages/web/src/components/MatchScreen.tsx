import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Restaurant, VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../useSessionSocket.js";
import { distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { Confetti } from "./Confetti.js";
import { buzz } from "./haptics.js";
import { renderShareCard } from "./shareCard.js";

const APP_URL = "wherever.aidenjang.com";

/**
 * Share the verdict. Prefers the native share sheet with a generated image (the viral bit);
 * falls back to sharing text, then to copying. Returns how it resolved so the UI can confirm.
 */
async function shareVerdict(restaurant: Restaurant): Promise<"shared" | "copied"> {
  const text = `We're eating at ${restaurant.name}. Decided by swipe, not by group chat. ${APP_URL}`;
  const blob = await renderShareCard(restaurant).catch(() => null);
  const file = blob ? new File([blob], "wherever.png", { type: "image/png" }) : null;

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: "Wherever, Honestly", text, files: [file] });
      return "shared";
    } catch {
      // User dismissed the sheet or it failed; fall through to text/copy.
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Wherever, Honestly", text });
      return "shared";
    } catch {
      /* fall through */
    }
  }
  await navigator.clipboard.writeText(text).catch(() => {});
  return "copied";
}

function History({ visited }: { visited: VisitedPlace[] }) {
  if (visited.length === 0) return null;
  return (
    <div className="mt-10 text-left">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Already been dragged to
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {visited.map((v) => (
          <span
            key={v.restaurantId}
            className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-sm text-muted"
          >
            {v.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MatchScreen({
  match,
  visited,
  isHost,
  onAgain,
}: {
  match: NonNullable<MatchState>;
  visited: VisitedPlace[];
  isHost: boolean;
  onAgain: () => void;
}) {
  const navigate = useNavigate();

  if (match.kind === "none") {
    return (
      <div className="text-center max-w-sm mx-auto">
        <div className="text-6xl">🤷</div>
        <h1 className="mt-4 font-display text-4xl font-bold">Nobody liked anything.</h1>
        <p className="mt-3 text-muted">
          A clean sweep of nos. Genuinely impressive. Cereal is still on the table, spiritually.
        </p>
        {isHost ? (
          <button
            onClick={onAgain}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Run it back
          </button>
        ) : (
          <p className="mt-8 text-muted">Waiting for the host to run it back.</p>
        )}
        <History visited={visited} />
      </div>
    );
  }

  return <WinnerScreen match={match} visited={visited} isHost={isHost} onAgain={onAgain} navigate={navigate} />;
}

function WinnerScreen({
  match,
  visited,
  isHost,
  onAgain,
  navigate,
}: {
  match: Extract<NonNullable<MatchState>, { kind: "match" }>;
  visited: VisitedPlace[];
  isHost: boolean;
  onAgain: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { restaurant, rightSwipes, totalParticipants } = match;
  const [shareState, setShareState] = useState<"idle" | "sharing" | "shared" | "copied">("idle");

  // Celebrate once when the verdict lands: confetti + a short victory buzz.
  const [celebrate, setCelebrate] = useState(true);
  useEffect(() => {
    buzz([18, 40, 18]);
    const t = setTimeout(() => setCelebrate(false), 4000);
    return () => clearTimeout(t);
  }, []);

  async function share() {
    setShareState("sharing");
    const how = await shareVerdict(restaurant);
    setShareState(how);
    if (how === "copied") setTimeout(() => setShareState("idle"), 1800);
  }

  const shareLabel =
    shareState === "sharing"
      ? "Rounding everyone up..."
      : shareState === "copied"
        ? "Copied. Go gloat."
        : shareState === "shared"
          ? "Sent. It's official."
          : "Tell the group it's settled";

  return (
    <div className="relative text-center max-w-sm mx-auto w-full">
      {celebrate && <Confetti />}
      <p className="font-display text-lg font-bold tracking-widest text-acid uppercase">
        It&apos;s decided
      </p>
      <div className="pop-in mt-5 rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
        <RestaurantPhoto imageUrl={restaurant.imageUrl} category={restaurant.category} className="h-44" />
        <div className="p-5">
          <div className="font-display text-3xl font-extrabold leading-tight">
            {restaurant.name}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-sm text-muted">
            <span>{restaurant.category}</span>
            <span className="text-white/20">|</span>
            <span className="text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
              {restaurant.rating && restaurant.reviewCount
                ? ` (${reviewCountLabel(restaurant.reviewCount)})`
                : ""}
            </span>
            <span className="text-white/20">|</span>
            <span>{priceLabel(restaurant.priceTier)}</span>
            <span className="text-white/20">|</span>
            <span>{distanceLabel(restaurant.distanceMeters)}</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-muted">
        {rightSwipes} of {totalParticipants} wanted it. The rest will cope.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={share}
          disabled={shareState === "sharing"}
          className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 active:scale-[0.98] disabled:opacity-70 transition"
        >
          {shareLabel}
        </button>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name} ${restaurant.address ?? ""}`.trim())}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 active:scale-[0.98] transition"
        >
          Get directions ↗
        </a>
        {isHost ? (
          <button
            onClick={onAgain}
            className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
          >
            Nope, again (this one&apos;s out)
          </button>
        ) : (
          <button
            onClick={() => navigate("/")}
            className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
          >
            Show myself out
          </button>
        )}
      </div>

      <History visited={visited} />
    </div>
  );
}
