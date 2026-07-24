import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Restaurant, VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../useSessionSocket.js";
import { categoryLabel, distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { Confetti } from "./Confetti.js";
import { buzz } from "./haptics.js";

/** The place's own Google Maps URI when we have it, else a name+address search on Maps. */
function directionsUrl(r: Restaurant): string {
  return (
    r.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address ?? ""}`.trim())}`
  );
}

/**
 * Combined action: share the winning place as a Google Maps link through the native share sheet, so
 * one button both tells the group it's settled AND gives everyone the way there. No image is
 * generated and nothing is downloaded; if there's no share sheet we copy the text + link instead.
 */
async function shareVerdict(restaurant: Restaurant): Promise<"shared" | "copied"> {
  const text = `We're eating at ${restaurant.name}. Majority ruled, the group chat lost.`;
  const url = directionsUrl(restaurant);

  if (navigator.share) {
    try {
      await navigator.share({ title: "Wherever, Honestly", text, url });
      return "shared";
    } catch {
      // User dismissed the sheet or it failed; fall through to copy.
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
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
  const [detailOpen, setDetailOpen] = useState(false);

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
          : "Tell the group + directions ↗";

  return (
    <div className="relative text-center max-w-sm mx-auto w-full">
      {celebrate && <Confetti />}
      <p className="font-display text-lg font-bold tracking-widest text-acid uppercase">
        It&apos;s decided
      </p>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        aria-label={`See details for ${restaurant.name}`}
        className="pop-in relative mt-5 block w-full text-left rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden cursor-pointer hover:border-white/25 transition-colors"
      >
        <RestaurantPhoto imageUrl={restaurant.imageUrl} category={restaurant.category} className="h-44" />
        <span className="pointer-events-none absolute top-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-sm font-semibold text-white/90 backdrop-blur-sm">
          i
        </span>
        <div className="p-5">
          <div className="font-display text-3xl font-extrabold leading-tight line-clamp-2">
            {restaurant.name}
          </div>
          {/* Category on its own line, stats below with each value kept whole — same treatment as
              the deck card so the winner never wraps mid-value on a phone. */}
          <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="whitespace-nowrap text-acid">
              {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
              {restaurant.rating && restaurant.reviewCount
                ? ` (${reviewCountLabel(restaurant.reviewCount)})`
                : ""}
            </span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{priceLabel(restaurant.priceTier)}</span>
            <span className="text-white/20">·</span>
            <span className="whitespace-nowrap">{distanceLabel(restaurant.distanceMeters)}</span>
          </div>
          <p className="mt-3 text-xs text-muted">Tap for hours, phone &amp; directions</p>
        </div>
      </button>

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
        {isHost ? (
          <button
            onClick={onAgain}
            className="rounded-full border border-white/15 px-8 py-3 text-lg font-semibold hover:bg-white/5 transition"
          >
            Run it back (this one&apos;s out)
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

      {detailOpen && (
        <RestaurantDetail restaurant={restaurant} onClose={() => setDetailOpen(false)} />
      )}
    </div>
  );
}
