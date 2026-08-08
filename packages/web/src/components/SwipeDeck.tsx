import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { Restaurant, SwipeDirection } from "@wherever/shared";
import { categoryLabel, distanceLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { buzz } from "./haptics.js";

const SWIPE_THRESHOLD = 110;
const HINT_KEY = "wherever:swipe-hint-seen";

function CardFace({
  restaurant,
  photoUrl,
  photoCount,
  photoIdx,
}: {
  restaurant: Restaurant;
  photoUrl: string | null | undefined;
  photoCount: number;
  photoIdx: number;
}) {
  return (
    <>
      {/* data-card-photo marks the photo zone: TopCard's tap handler cycles photos here and opens
          details everywhere else. */}
      <div data-card-photo className="relative">
        <RestaurantPhoto imageUrl={photoUrl ?? null} category={restaurant.category} className="h-[clamp(132px,24dvh,192px)]" />
        {photoCount > 1 && (
          <div className="pointer-events-none absolute inset-x-3 top-2 flex gap-1">
            {Array.from({ length: photoCount }).map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i === photoIdx ? "bg-white" : "bg-white/35"}`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="font-display text-2xl font-bold leading-tight line-clamp-2">
          {restaurant.name}
        </div>
        {/* Category on its own line (it's the long one), then the short stats — each atomic value
            kept on one line so "3.6 mi" can never split across a wrap. */}
        <div className="mt-2 truncate text-sm text-muted">{categoryLabel(restaurant.category)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
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
      </div>
    </>
  );
}

/** A screen-reader summary of the card, so deciding isn't a guess without sight. */
function cardDescription(r: Restaurant): string {
  const parts = [r.name, categoryLabel(r.category)];
  if (r.rating) {
    parts.push(
      r.reviewCount
        ? `${r.rating} stars, ${reviewCountLabel(r.reviewCount)} reviews`
        : `${r.rating} stars`,
    );
  }
  parts.push(priceLabel(r.priceTier), distanceLabel(r.distanceMeters));
  return parts.filter(Boolean).join(", ");
}

// A press that moves less than this many pixels counts as a tap (open details) rather than a drag.
const TAP_MOVE_TOLERANCE = 8;

function TopCard({
  restaurant,
  exitDir,
  onCommit,
  onOpenDetail,
}: {
  restaurant: Restaurant;
  exitDir: SwipeDirection;
  onCommit: (dir: SwipeDirection) => void;
  onOpenDetail: (r: Restaurant) => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  // No tilt for motion-sensitive users; the card still tracks the drag horizontally.
  const rotate = useTransform(x, [-220, 220], reduce ? [0, 0] : [-16, 16]);
  const yes = useTransform(x, [30, 130], [0, 1]);
  const nope = useTransform(x, [-130, -30], [1, 0]);
  // Distinguish a tap from a drag (a vote) by how far the pointer travelled between down and up,
  // so tapping never fights the swipe gesture.
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // Photos: tapping the photo cycles through them; tapping the "i" badge or the text area opens
  // details. Fall back to the single imageUrl when there's no gallery.
  const photos =
    restaurant.photos && restaurant.photos.length > 0
      ? restaurant.photos
      : restaurant.imageUrl
        ? [restaurant.imageUrl]
        : [];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [restaurant.id]);

  return (
    <motion.div
      className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 shadow-2xl shadow-black/60 overflow-hidden cursor-grab active:cursor-grabbing"
      role="group"
      aria-roledescription="restaurant card"
      aria-label={cardDescription(restaurant)}
      style={{ x, rotate, touchAction: "pan-y" }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.5}
      onPointerDown={(e) => {
        pressStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const start = pressStart.current;
        pressStart.current = null;
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= TAP_MOVE_TOLERANCE) {
          return;
        }
        const target = e.target as HTMLElement;
        // Tapping the photo (but not the "i" badge sitting on it) cycles photos; everywhere else
        // — the badge and the text area below — opens details.
        if (
          photos.length > 1 &&
          target.closest?.("[data-card-photo]") &&
          !target.closest?.("[data-card-info]")
        ) {
          setPhotoIdx((i) => (i + 1) % photos.length);
        } else {
          onOpenDetail(restaurant);
        }
      }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_THRESHOLD) onCommit("right");
        else if (info.offset.x < -SWIPE_THRESHOLD) onCommit("left");
      }}
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.12 } }
          : { x: exitDir === "right" ? 700 : -700, opacity: 0, transition: { duration: 0.28 } }
      }
    >
      <CardFace
        restaurant={restaurant}
        photoUrl={photos[photoIdx] ?? restaurant.imageUrl}
        photoCount={photos.length}
        photoIdx={photoIdx}
      />
      {/* The details affordance: a real hit target (data-card-info) so the tap handler opens details
          when it's tapped, even though the surrounding photo cycles. */}
      <span
        data-card-info
        className="absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-sm font-semibold text-white/90 backdrop-blur-sm"
      >
        i
      </span>
      <motion.span
        className="absolute top-6 left-6 rotate-[-14deg] rounded-xl border-2 border-acid bg-ink/70 px-4 py-1.5 text-lg font-extrabold tracking-widest text-acid backdrop-blur-[2px]"
        style={{ opacity: yes }}
      >
        LET&apos;S EAT
      </motion.span>
      <motion.span
        className="absolute top-6 right-6 rotate-[14deg] rounded-xl border-2 border-flare bg-ink/70 px-4 py-1.5 text-lg font-extrabold tracking-widest text-flare backdrop-blur-[2px]"
        style={{ opacity: nope }}
      >
        HARD PASS
      </motion.span>
    </motion.div>
  );
}

/** Card-shaped placeholder shown while the first deck is being fetched. */
export function DeckSkeleton() {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative h-[clamp(288px,48dvh,360px)]">
        <div
          className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden animate-pulse"
          style={{ transform: "scale(0.95) translateY(14px)" }}
        />
        <div className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden animate-pulse">
          <div className="h-[clamp(132px,24dvh,192px)] bg-white/5" />
          <div className="p-5 space-y-3">
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/5" />
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-muted">Finding places you'll still complain about...</p>
    </div>
  );
}

export function SwipeDeck({
  restaurants,
  alreadyVoted = [],
  superSpent = false,
  vetoSpent = false,
  onSwipe,
}: {
  restaurants: Restaurant[];
  alreadyVoted?: string[];
  superSpent?: boolean;
  /** Seeded from the server so a reconnect can't hand back a spent veto. */
  vetoSpent?: boolean;
  onSwipe: (restaurantId: string, direction: SwipeDirection, isSuper?: boolean, isVeto?: boolean) => void;
}) {
  // Resume after a reconnect: start at the first card this client has not voted.
  const [index, setIndex] = useState(() => {
    const voted = new Set(alreadyVoted);
    const first = restaurants.findIndex((r) => !voted.has(r.id));
    return first === -1 ? restaurants.length : first;
  });
  const [exitDir, setExitDir] = useState<SwipeDirection>("right");
  // One super-like per round; seeded from the server (survives reconnect) then set locally on use.
  const [superUsed, setSuperUsed] = useState(superSpent);
  const [vetoUsed, setVetoUsed] = useState(vetoSpent);
  // The card whose full details are open in the sheet (null = closed). Tapping a card opens it;
  // it never blocks voting since a drag isn't a tap.
  const [detail, setDetail] = useState<Restaurant | null>(null);

  // First-run gesture hint: shown once ever, then remembered.
  const [showHint, setShowHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  const dismissHint = useCallback(() => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private mode; fine */
    }
  }, []);

  // Authoritative pointer, advanced synchronously in commit. Two events in one frame (e.g. arrow
  // key auto-repeat) would otherwise both read the same `index` from the closure and net +2 — voting
  // one card twice and skipping the next, which then never gets voted and stalls completion.
  const indexRef = useRef(index);
  const commit = useCallback(
    (dir: SwipeDirection, isSuper = false, isVeto = false) => {
      const i = indexRef.current;
      const current = restaurants[i];
      if (!current) return;
      indexRef.current = i + 1;
      // A firmer triple-buzz for a super-like; light on a like, double on a pass.
      buzz(isVeto ? [20, 40, 20, 40] : isSuper ? [12, 30, 12] : dir === "right" ? 12 : [8, 20]);
      if (isSuper) setSuperUsed(true);
      if (isVeto) setVetoUsed(true);
      dismissHint();
      setExitDir(dir);
      onSwipe(current.id, dir, isSuper, isVeto);
      setIndex(i + 1);
    },
    [restaurants, onSwipe, dismissHint],
  );

  // Don't let the hint linger if they just sit there.
  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(dismissHint, 5000);
    return () => clearTimeout(t);
  }, [showHint, dismissHint]);

  // Desktop: arrow keys swipe. Suspended while the detail sheet is open so arrows don't vote the
  // card behind it (the sheet has its own concerns, e.g. dismissing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key === "ArrowLeft") commit("left");
      else if (e.key === "ArrowRight") commit("right");
      else if (e.key === "ArrowUp" && !superUsed) commit("right", true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, detail, superUsed]);

  const done = index >= restaurants.length;

  if (done) {
    return (
      <div className="text-center max-w-sm mx-auto mt-10">
        <div className="text-5xl">🧾</div>
        <h2 className="mt-4 font-display text-3xl font-bold">That's all of them.</h2>
        <p className="mt-2 text-muted">
          Your votes are in. Now we wait on everyone else to stop overthinking a
          taco. This is the longest part.
        </p>
      </div>
    );
  }

  const upcoming = restaurants.slice(index + 1, index + 3);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative h-[clamp(288px,48dvh,360px)]">
        {/* Background cards, peeking behind the top one. */}
        {upcoming
          .map((r, i) => (
            <div
              key={r.id}
              className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden transition-transform duration-200"
              style={{
                transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 14}px)`,
                zIndex: -i - 1,
              }}
            >
              <CardFace restaurant={r} photoUrl={r.imageUrl} photoCount={0} photoIdx={0} />
            </div>
          ))
          .reverse()}

        <AnimatePresence initial={false}>
          <TopCard
            key={restaurants[index]!.id}
            restaurant={restaurants[index]!}
            exitDir={exitDir}
            onCommit={commit}
            onOpenDetail={setDetail}
          />
        </AnimatePresence>
      </div>

      {showHint && (
        <p className="mt-4 text-center text-xs text-muted animate-pulse">
          Tap for details, drag or tap below to vote. <span className="text-flare">✕ pass</span>
          {" · "}
          <span className="text-acid">♥ eat</span>
        </p>
      )}

      {/* mt-4, not mt-8: the whole swiping column has to clear a 720px laptop, and the buttons stay
          at 64px because they are the primary target on a phone. See the main in Lobby. */}
      <div className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label="Hard pass"
          onClick={() => commit("left")}
          className="grid place-items-center h-16 w-16 rounded-full border border-white/15 text-2xl hover:border-flare hover:text-flare hover:scale-105 active:scale-95 transition"
        >
          ✕
        </button>
        <button
          type="button"
          aria-label={vetoUsed ? "Veto used" : "Veto (one per round, kills it outright)"}
          disabled={vetoUsed}
          onClick={() => commit("left", false, true)}
          className={`grid place-items-center h-12 w-12 rounded-full border text-xl transition ${
            vetoUsed
              ? "border-white/10 text-white/25"
              : "border-flare text-flare hover:scale-105 active:scale-95 hover:bg-flare/10"
          }`}
        >
          🚫
        </button>
        <button
          type="button"
          aria-label={superUsed ? "Super-like used" : "Super-like (one per round)"}
          disabled={superUsed}
          onClick={() => commit("right", true)}
          className={`grid place-items-center h-12 w-12 rounded-full border text-xl transition ${
            superUsed
              ? "border-white/10 text-white/25"
              : "border-grape text-grape hover:scale-105 active:scale-95 hover:bg-grape/10"
          }`}
        >
          ⭐
        </button>
        <button
          type="button"
          aria-label="Let's eat"
          onClick={() => commit("right")}
          className="grid place-items-center h-16 w-16 rounded-full bg-acid text-ink text-2xl font-bold hover:scale-105 active:scale-95 transition"
        >
          ♥
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-muted tabular-nums">
        {index + 1} / {restaurants.length}
        {!superUsed && <span className="ml-2 text-grape">· ⭐ super</span>}
        {!vetoUsed && <span className="ml-2 text-flare">· 🚫 veto, kills it</span>}
      </p>

      {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
