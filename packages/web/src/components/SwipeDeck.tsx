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
import { play } from "./sound.js";
import { swipeAnnouncement, throwDistance, throwDuration, throwVerdict, undoAnnouncement } from "@wherever/shared";
import { useLine } from "../useLine.js";

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
        <RestaurantPhoto imageUrl={photoUrl ?? null} category={restaurant.category} className="h-[clamp(132px,24dvh,192px)] lg:h-[clamp(200px,38dvh,340px)]" />
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
  // Last throw's speed, read by the exit. Zero for a button or key press, which is not a throw.
  const thrownAt = useRef(0);

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
        const verdict = throwVerdict(info.offset.x, info.velocity.x);
        if (!verdict) return;
        // Remember how hard it went so the exit matches the gesture rather than a fixed 0.28s.
        thrownAt.current = info.velocity.x;
        onCommit(verdict);
      }}
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.12 } }
          : {
              x: exitDir === "right" ? throwDistance(thrownAt.current) : -throwDistance(thrownAt.current),
              opacity: 0,
              transition: { duration: throwDuration(thrownAt.current), ease: "easeOut" },
            }
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
  const dealingLine = useLine("dealing");
  return (
    <div className="w-full max-w-sm mx-auto lg:max-w-none">
      <div className="relative h-[clamp(288px,48dvh,360px)] lg:h-[clamp(360px,64dvh,520px)]">
        <div
          className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden animate-pulse"
          style={{ transform: "scale(0.95) translateY(14px)" }}
        />
        <div className="absolute inset-0 rounded-[28px] bg-ink-soft border border-white/10 overflow-hidden animate-pulse">
          <div className="h-[clamp(132px,24dvh,192px)] lg:h-[clamp(200px,38dvh,340px)] bg-white/5" />
          <div className="p-5 space-y-3">
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/5" />
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-muted">{dealingLine}</p>
    </div>
  );
}

export function SwipeDeck({
  restaurants,
  alreadyVoted = [],
  superSpent = false,
  vetoSpent = false,
  onSwipe,
  onUndo,
  onAnnounce,
}: {
  restaurants: Restaurant[];
  alreadyVoted?: string[];
  superSpent?: boolean;
  /** Seeded from the server so a reconnect can't hand back a spent veto. */
  vetoSpent?: boolean;
  onSwipe: (restaurantId: string, direction: SwipeDirection, isSuper?: boolean, isVeto?: boolean) => void;
  onUndo: (restaurantId: string) => void;
  /** Feeds the page's live region, so voting is not silent for a screen reader. */
  onAnnounce?: (text: string) => void;
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
  // Only choices made in this mount are rewindable. Votes restored after a reconnect have no safe
  // local ordering, so guessing which was "last" could remove the wrong restaurant on the server.
  const historyRef = useRef<{ index: number; restaurantId: string; direction: SwipeDirection; super: boolean; veto: boolean }[]>([]);
  const [choices, setChoices] = useState<{ restaurantId: string; direction: SwipeDirection; super: boolean; veto: boolean }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
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
      play(isVeto ? "veto" : isSuper ? "superLike" : dir === "right" ? "like" : "pass");
      if (isSuper) setSuperUsed(true);
      if (isVeto) setVetoUsed(true);
      historyRef.current.push({ index: i, restaurantId: current.id, direction: dir, super: isSuper, veto: isVeto });
      setChoices((previous) => [...previous, { restaurantId: current.id, direction: dir, super: isSuper, veto: isVeto }]);
      setCanUndo(true);
      dismissHint();
      setExitDir(dir);
      onSwipe(current.id, dir, isSuper, isVeto);
      // The card changes under a sighted user's eyes and silently for everyone else, so say it.
      onAnnounce?.(
        swipeAnnouncement({
          direction: dir,
          isSuper,
          isVeto,
          name: current.name,
          next: restaurants[i + 1]?.name ?? null,
          position: i + 2,
          total: restaurants.length,
        }),
      );
      setIndex(i + 1);
    },
    [restaurants, onSwipe, onAnnounce, dismissHint],
  );

  const undoLast = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    indexRef.current = previous.index;
    setIndex(previous.index);
    if (previous.super) setSuperUsed(false);
    if (previous.veto) setVetoUsed(false);
    setChoices((current) => current.slice(0, -1));
    setCanUndo(historyRef.current.length > 0);
    buzz(8);
    onUndo(previous.restaurantId);
    const back = restaurants[previous.index];
    if (back) onAnnounce?.(undoAnnouncement(back.name, previous.index + 1, restaurants.length));
  }, [onUndo, onAnnounce, restaurants]);

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
      if ((e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z")) && canUndo) {
        e.preventDefault();
        undoLast();
      } else if (e.key === "ArrowLeft") commit("left");
      else if (e.key === "ArrowRight") commit("right");
      else if (e.key === "ArrowUp" && !superUsed) commit("right", true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, commit, detail, superUsed, undoLast]);

  const done = index >= restaurants.length;
  const waitingLine = useLine("waiting");

  /*
   * Fetch the next two cards' photos while this one is being decided.
   *
   * A swipe reveals the card underneath instantly, but its photo starts loading only then, so on a
   * phone every swipe flashes the fallback gradient first. Two ahead covers a fast double-swipe
   * without pulling the whole deck down a mobile connection.
   */
  useEffect(() => {
    for (const next of restaurants.slice(index + 1, index + 3)) {
      const url = next.imageUrl ?? next.photos?.[0];
      if (url) new Image().src = url;
    }
  }, [index, restaurants]);
  const likedChoices = choices.filter((choice) => choice.direction === "right");

  if (done) {
    return (
      <>
        <div className="text-center max-w-sm mx-auto mt-10">
          <div className="text-5xl">🧾</div>
          <h2 className="mt-4 font-display text-3xl font-bold">That's all of them.</h2>
          <p className="mt-2 text-muted">{waitingLine}</p>
          {choices.length > 0 && (
            <details className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] text-left">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-cream [&::-webkit-details-marker]:hidden">
                <span>Your private shortlist</span>
                <span className="rounded-full bg-acid/10 px-2 py-0.5 text-xs text-acid">
                  {likedChoices.length} liked
                </span>
              </summary>
              <div className="border-t border-white/10 p-2">
                {likedChoices.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted">You passed on the whole deck. Bold.</p>
                ) : (
                  <ul className="space-y-1">
                    {likedChoices.map((choice) => {
                      const restaurant = restaurants.find((candidate) => candidate.id === choice.restaurantId);
                      if (!restaurant) return null;
                      return (
                        <li key={choice.restaurantId}>
                          <button
                            type="button"
                            onClick={() => setDetail(restaurant)}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
                          >
                            <span className="min-w-0 truncate font-medium">{restaurant.name}</span>
                            <span className={choice.super ? "shrink-0 text-grape" : "shrink-0 text-acid"}>
                              {choice.super ? "⭐ super" : "♥ liked"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </details>
          )}
          {canUndo && (
            <button
              type="button"
              onClick={undoLast}
              className="mt-4 rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-muted transition hover:border-white/30 hover:text-cream active:scale-95"
            >
              Undo last vote
            </button>
          )}
        </div>
        {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
      </>
    );
  }

  const upcoming = restaurants.slice(index + 1, index + 3);

  return (
    <div className="w-full max-w-sm mx-auto lg:max-w-none">
      <div className="relative h-[clamp(288px,48dvh,360px)] lg:h-[clamp(360px,64dvh,520px)]">
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
      {canUndo && (
        <button
          type="button"
          onClick={undoLast}
          className="mx-auto mt-2 block px-3 py-1 text-xs font-medium text-muted transition hover:text-cream hover:underline"
        >
          Undo last vote
        </button>
      )}

      {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
