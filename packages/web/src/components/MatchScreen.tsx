import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Restaurant, VisitedPlace } from "@wherever/shared";
import type { MatchState } from "../useSessionSocket.js";
import { categoryLabel, distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { Confetti } from "./Confetti.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";

/**
 * A Google Maps link to the winning place itself (the place page, not turn-by-turn navigation), so
 * tapping the button just opens the spot in Maps. Prefers the place's canonical Maps URI; otherwise
 * a name+address search, with the address included so it resolves to the right spot even for chains.
 */
function mapsUrl(r: Restaurant): string {
  return (
    r.googleMapsUri ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address ?? ""}`.trim())}`
  );
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
    // Two very different rounds end here, and saying "nobody liked anything" about the second one
    // is just false — people wanted things, and every one of them got vetoed. That is also the
    // case where somebody most wants to know what actually happened to their pick.
    const allVetoed = match.vetoedCount > 0;
    return (
      <div className="text-center max-w-sm mx-auto">
        <div className="text-6xl">{allVetoed ? "🚫" : "🤷"}</div>
        <h1 className="mt-4 font-display text-4xl font-bold">
          {allVetoed ? "Everything got vetoed." : "Nobody liked anything."}
        </h1>
        <p className="mt-3 text-muted">
          {allVetoed
            ? `${match.vetoedCount} place${match.vetoedCount === 1 ? "" : "s"} struck off, and whatever survived, nobody wanted. Run it back with a wider net.`
            : "A clean sweep of nos. Genuinely impressive. Cereal is still on the table, spiritually."}
        </p>
        {isHost ? (
          <button
            onClick={onAgain}
            className="mt-8 rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Run it back
          </button>
        ) : (
          <p className="mt-8 text-muted">Round two is the host&rsquo;s call.</p>
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
  const { restaurant, rightSwipes, totalParticipants, vetoedCount, round } = match;
  const [detailOpen, setDetailOpen] = useState(false);

  // Celebrate once when the verdict lands: confetti, a victory buzz, and the fanfare.
  const [celebrate, setCelebrate] = useState(true);
  useEffect(() => {
    buzz([18, 40, 18]);
    play("match");
    const t = setTimeout(() => setCelebrate(false), 4000);
    return () => clearTimeout(t);
  }, []);

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
          {/*
            Whether it is open, on the winner itself.
            The detail sheet has said this all along, but only after a tap, and this is the one fact
            that can undo the decision the group just made: a closed door after everyone has agreed
            and started walking is the failure this screen exists to prevent. Permanent closure
            outranks today's hours, same order the detail sheet uses.
          */}
          {(() => {
            const shut =
              restaurant.businessStatus === "CLOSED_PERMANENTLY"
                ? "Permanently closed"
                : restaurant.businessStatus === "CLOSED_TEMPORARILY"
                  ? "Temporarily closed"
                  : null;
            if (shut) return <p className="mt-2 text-sm font-semibold text-flare">{shut}</p>;
            if (restaurant.openNow == null) return null;
            return (
              <p className={`mt-2 text-sm font-semibold ${restaurant.openNow ? "text-acid" : "text-flare"}`}>
                {restaurant.openNow ? "Open now" : "Closed right now"}
              </p>
            );
          })()}
          <p className="mt-3 text-xs text-muted">Tap for hours, phone &amp; directions</p>
        </div>
      </button>

      <p className="mt-4 text-muted">
        {rightSwipes} of {totalParticipants} wanted it. The rest will cope.
      </p>
      {/* Without this a vetoed favourite just silently isn't here, which reads as the tally being
          wrong rather than as somebody having used their one no. Count only — who spent it stays
          private, the same as every other vote in a round. */}
      {vetoedCount > 0 && (
        <p className="mt-1 text-sm text-muted/70">
          🚫 {vetoedCount} {vetoedCount === 1 ? "place was" : "places were"} vetoed out of the running.
        </p>
      )}
      {/* Only once the group has genuinely laboured. Round 1 is just dinner; saying "round 1" about
          it would be noise, and the joke below only earns itself if the number is real. */}
      {round >= 2 && (
        <p className="mt-1 text-sm italic text-muted/70">
          {round >= 4
            ? `${round} rounds to pick one place. The group chat would have been faster.`
            : `Round ${round}. Worth the wait, presumably.`}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={mapsUrl(restaurant)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
        >
          Open in Google Maps ↗
        </a>
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
