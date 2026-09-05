import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { line, type Restaurant, type SwipeDirection, type VisitedPlace } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel, styleFor } from "./cardStyle.js";
import { RestaurantPhoto } from "./RestaurantPhoto.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";
import {
  swipeAnnouncement,
  throwDistance,
  throwDuration,
  throwVerdict,
  distanceText,
  undoAnnouncement,
  revisitNote,
} from "@wherever/shared";
import { useLine } from "../useLine.js";

const HINT_KEY = "wherever:swipe-hint-seen";

function CardFace({
  restaurant,
  photoUrl,
  photoCount,
  photoIdx,
  revisit,
}: {
  restaurant: Restaurant;
  photoUrl: string | null | undefined;
  photoCount: number;
  photoIdx: number;
  /** "you came here about 5 months ago", or null for anywhere new. */
  revisit?: string | null;
}) {
  // The app knows roughly forty cuisines by emoji and colour, and until now only showed you when the
  // photo failed. A pizza card and a sushi card looked identical the rest of the time.
  const cuisine = styleFor(restaurant.category);
  return (
    <>
      {/* data-card-photo marks the photo zone: TopCard's tap handler cycles photos here and opens
          details everywhere else. */}
      <div data-card-photo className="relative">
        <RestaurantPhoto
          imageUrl={photoUrl ?? null}
          category={restaurant.category}
          className="h-[clamp(132px,24dvh,192px)] lg:h-[clamp(200px,38dvh,340px)]"
        />
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
        {revisit && (
          <div className="pointer-events-none absolute inset-x-3 bottom-2 flex">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-ink/75 px-2.5 py-1 text-2xs font-semibold text-flame backdrop-blur-sm">
              <span aria-hidden>↺</span> {revisit}
            </span>
          </div>
        )}
      </div>
      <div className="h-[3px] w-full shrink-0" style={{ background: cuisine.gradient }} aria-hidden />
      <div className="p-5">
        <div className="font-display text-2xl font-bold leading-tight line-clamp-2">{restaurant.name}</div>
        {/* Category on its own line (it's the long one), then the short stats — each atomic value
            kept on one line so "3.6 mi" can never split across a wrap. */}
        <div className="mt-2 truncate text-sm text-muted">
          <span aria-hidden>{cuisine.emoji}</span> {categoryLabel(restaurant.category)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted tabular-nums">
          <span className="whitespace-nowrap text-acid">
            {restaurant.rating ? `★ ${restaurant.rating}` : "new"}
            {restaurant.rating && restaurant.reviewCount
              ? ` (${reviewCountLabel(restaurant.reviewCount)})`
              : ""}
          </span>
          <span className="text-white/20">·</span>
          <span className="whitespace-nowrap" title={priceLabel(restaurant.priceTier)}>
            {restaurant.priceRange ?? priceLabel(restaurant.priceTier)}
          </span>
          {/*
            Carries the weight of the row, because it is the number the vote turns on: the rating is
            whether it is any good and the price is a detail, but "24 min drive" is what somebody is
            actually agreeing to. It read at exactly the same weight as the price tier before.

            Null when the source gave no distance, and the separator goes with it.
          */}
          {distanceText(restaurant.distanceMeters) && (
            <>
              <span className="text-white/20">·</span>
              <span className="whitespace-nowrap font-semibold text-cream tabular-nums">
                {distanceText(restaurant.distanceMeters)}
              </span>
            </>
          )}
        </div>
        {/* One line of why, from the source's own summary. Desktop only: the card is a fixed height
            and on a phone this would push the stats out of it. */}
        {restaurant.editorialSummary && (
          <p className="mt-2 hidden text-sm leading-snug text-white/55 line-clamp-2 lg:block">
            {restaurant.editorialSummary}
          </p>
        )}
        {/* Shut is the one fact worth knowing before you swipe yes, not after the group has picked
            it. Null means the source had no hours, which is not the same as closed. */}
        {restaurant.openNow === false && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-flare/10 px-2.5 py-1 text-xs font-semibold text-flare">
            <span aria-hidden>●</span> Closed right now
          </div>
        )}
        {restaurant.openNow === true && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-acid">
            <span aria-hidden>●</span> Open now
          </div>
        )}
      </div>
    </>
  );
}

/**
 * One key cap in the desktop legend. Dimmed rather than hidden when spent, so the row does not
 * reflow under the counter every time somebody uses their super-like.
 */
function Key({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return (
    <kbd
      className={`rounded border px-1.5 py-0.5 font-sans not-italic ${
        dim ? "border-white/10 text-white/25" : "border-white/20 bg-white/5 text-cream"
      }`}
    >
      {children}
    </kbd>
  );
}

/** A screen-reader summary of the card, so deciding isn't a guess without sight. */
function cardDescription(r: Restaurant, revisit?: string | null): string {
  const parts: (string | null)[] = [r.name, categoryLabel(r.category)];
  if (r.rating) {
    parts.push(
      r.reviewCount ? `${r.rating} stars, ${reviewCountLabel(r.reviewCount)} reviews` : `${r.rating} stars`,
    );
  }
  parts.push(priceLabel(r.priceTier), distanceText(r.distanceMeters));
  // Closed is worth hearing before you vote, same as seeing it.
  if (r.openNow === false) parts.push("closed right now");
  if (revisit) parts.push(revisit);
  return parts.filter(Boolean).join(", ");
}

/* Deck left, everything else right, one column on a phone. The left column is capped at the card's
   own width so it does not stretch on a wide screen. */
const SPLIT =
  "w-full lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center lg:gap-12";
const RAIL = "mx-auto w-full min-w-0 max-w-sm lg:mx-0 lg:max-w-none lg:text-left";

// A press that moves less than this many pixels counts as a tap (open details) rather than a drag.
const TAP_MOVE_TOLERANCE = 8;

function TopCard({
  revisit,
  restaurant,
  exitDir,
  onCommit,
  onOpenDetail,
}: {
  restaurant: Restaurant;
  exitDir: SwipeDirection;
  revisit: string | null;
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
      className="absolute inset-0 rounded-card bg-ink-soft border border-white/10 shadow-raised overflow-hidden cursor-grab active:cursor-grabbing"
      role="group"
      aria-roledescription="restaurant card"
      aria-label={cardDescription(restaurant, revisit)}
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
      /*
       * Inert right now: framer only reads `exit` under an `AnimatePresence`, and this deck no longer has
       * one (see the note at the render site). This is the throw the card should make when it leaves, and
       * the machinery for it - exitDir, thrownAt, throwDistance, throwDuration - is still here for whoever
       * puts it back.
       */
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
        revisit={revisit}
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
        NOPE
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
          className="absolute inset-0 rounded-card bg-ink-soft border border-white/10 overflow-hidden animate-pulse"
          style={{ transform: "scale(0.95) translateY(14px)" }}
        />
        <div className="absolute inset-0 rounded-card bg-ink-soft border border-white/10 overflow-hidden animate-pulse">
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
  visited = [],
  superSpent = false,
  vetoSpent = false,
  onSwipe,
  onUndo,
  onAnnounce,
  aside,
}: {
  restaurants: Restaurant[];
  alreadyVoted?: string[];
  /** Where the group has already been, so a place out of cooldown says so instead of arriving as new. */
  visited?: VisitedPlace[];
  superSpent?: boolean;
  /** Seeded from the server so a reconnect can't hand back a spent veto. */
  vetoSpent?: boolean;
  onSwipe: (restaurantId: string, direction: SwipeDirection, isSuper?: boolean, isVeto?: boolean) => void;
  /*
   * The group panel, in the second column on a wide screen and under the deck on a phone.
   *
   * Passed in rather than placed by the caller, because the deck's own status - where you are, what the
   * keys do, whether you can undo - belongs in that column too, and only the deck knows any of it.
   */
  aside?: ReactNode;
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
  const historyRef = useRef<
    { index: number; restaurantId: string; direction: SwipeDirection; super: boolean; veto: boolean }[]
  >([]);
  const [choices, setChoices] = useState<
    { restaurantId: string; direction: SwipeDirection; super: boolean; veto: boolean }[]
  >([]);
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
  /*
   * Why a spent button did nothing, said at the moment it does nothing.
   *
   * The veto and the super-like used to be `disabled`, which swallows the click, so the only
   * feedback for tapping one twice was silence and the button looked broken. `aria-disabled` keeps
   * it focusable and clickable so it can answer for itself.
   */
  const [spentNote, setSpentNote] = useState<string | null>(null);
  const saySpent = useCallback(
    (moment: "vetoSpent" | "superSpent") => {
      const text = line(moment, Date.now());
      setSpentNote(text);
      onAnnounce?.(text);
    },
    [onAnnounce],
  );
  useEffect(() => {
    if (!spentNote) return;
    const t = setTimeout(() => setSpentNote(null), 4000);
    return () => clearTimeout(t);
  }, [spentNote]);

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
      historyRef.current.push({
        index: i,
        restaurantId: current.id,
        direction: dir,
        super: isSuper,
        veto: isVeto,
      });
      setChoices((previous) => [
        ...previous,
        { restaurantId: current.id, direction: dir, super: isSuper, veto: isVeto },
      ]);
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
      else if (e.key === "ArrowDown" && !vetoUsed) commit("left", false, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, commit, detail, superUsed, undoLast, vetoUsed]);

  const done = index >= restaurants.length;
  const waitingLine = useLine("waiting");

  /* A short window, not a mount-only flag: background cards are keyed by restaurant, so a new one
     mounts on every swipe and animating those would make the stack twitch on each vote. */
  const [dealing, setDealing] = useState(true);
  useEffect(() => {
    play("deal");
    const t = setTimeout(() => setDealing(false), 700);
    return () => clearTimeout(t);
  }, []);

  /*
   * Two cards ahead. A swipe reveals the one underneath instantly but its photo only starts loading
   * then, so on a phone every swipe flashed the fallback gradient first. Two covers a fast double-swipe
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
      <div className={SPLIT}>
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
                      const restaurant = restaurants.find(
                        (candidate) => candidate.id === choice.restaurantId,
                      );
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
        {/* Waiting on other people is exactly when their progress is worth looking at. */}
        {aside && <div className={RAIL}>{aside}</div>}
        {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
      </div>
    );
  }

  const upcoming = restaurants.slice(index + 1, index + 3);

  return (
    <div className={SPLIT}>
      <div className="mx-auto w-full min-w-0 max-w-sm lg:mx-0 lg:max-w-none">
        <div className="relative h-[clamp(288px,48dvh,360px)] lg:h-[clamp(360px,64dvh,520px)]">
          {/* Background cards, peeking behind the top one. */}
          {upcoming
            .map((r, i) => (
              /* Two elements on purpose: the wrapper carries the deal animation, the inner one carries
               the stack's own transform. One element cannot do both, because the animation ends at
               `transform: none` and would drop the card out of the stack as it landed. */
              <div
                key={r.id}
                className={`absolute inset-0 ${dealing ? "deal-in" : ""}`}
                style={dealing ? { animationDelay: `${(i + 1) * 90}ms` } : undefined}
              >
                <div
                  className="absolute inset-0 rounded-card bg-ink-soft border border-white/10 overflow-hidden transition-transform duration-200"
                  style={{
                    transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 14}px)`,
                    zIndex: -i - 1,
                  }}
                >
                  <CardFace
                    restaurant={r}
                    photoUrl={r.imageUrl}
                    photoCount={0}
                    photoIdx={0}
                    revisit={revisitNote(visited, r.id)}
                  />
                </div>
              </div>
            ))
            .reverse()}

          {/*
          No AnimatePresence here, deliberately.
          
          It was wrapping this card so the outgoing one could fly off, and the exit animation never
          ran: the presence context was correct (`isPresent: false` on the outgoing child) and the
          `exit` prop reached the element, but framer never started the animation, so the card sat
          there and AnimatePresence held it mounted forever waiting for an exit that never finished.
          One card leaked per swipe, in the production build as well as in dev.
          
          Rendering the current card alone means React unmounts the previous one immediately, which
          is what the screen already looked like, minus the pile of dead cards behind it. Restoring
          the throw animation is a separate job and wants a real thumb to tune against.
        */}
          {/* Named for the view transition into the match screen: the browser pairs this box with the
            one in `MatchScreen` carrying the same name and tweens between them. `contents` cannot
            carry it - a box is required - so the name goes on the wrapper that has one. */}
          <div
            className={dealing ? "deal-in absolute inset-0" : "contents"}
            style={{ viewTransitionName: "chosen-card" } as CSSProperties}
          >
            <TopCard
              key={restaurants[index]!.id}
              restaurant={restaurants[index]!}
              exitDir={exitDir}
              revisit={revisitNote(visited, restaurants[index]!.id)}
              onCommit={commit}
              onOpenDetail={setDetail}
            />
          </div>
        </div>

        {showHint && !spentNote && (
          <p className="mt-4 text-center text-xs text-muted animate-pulse lg:hidden">
            Tap for details, drag or tap below to vote. <span className="text-flare">✕ pass</span>
            {" · "}
            <span className="text-acid">♥ eat</span>
          </p>
        )}

        {/* Every width, unlike the first-run hint above: the keyboard legend that carries this on a
            wide screen is `lg:` only, so a phone has nowhere else to learn why nothing happened. */}
        {spentNote && <p className="mt-4 text-center text-xs text-flare">{spentNote}</p>}

        {/* mt-4, not mt-8: the whole swiping column has to clear a 720px laptop, and the buttons stay
          at 64px because they are the primary target on a phone. See the main in Lobby. */}
        <div className="mt-4 flex items-center justify-center gap-5">
          <button
            type="button"
            aria-label="Pass"
            onClick={() => commit("left")}
            className="grid place-items-center h-16 w-16 rounded-full border border-white/15 text-2xl hover:border-flare hover:text-flare hover:scale-105 active:scale-95 transition"
          >
            ✕
          </button>
          <button
            type="button"
            aria-label={
              vetoUsed ? "Veto, already used this round" : "Veto (one per round, kills it outright)"
            }
            aria-disabled={vetoUsed}
            onClick={() => (vetoUsed ? saySpent("vetoSpent") : commit("left", false, true))}
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
            aria-label={superUsed ? "Super-like, already used this round" : "Super-like (one per round)"}
            aria-disabled={superUsed}
            onClick={() => (superUsed ? saySpent("superSpent") : commit("right", true))}
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
      </div>

      {/* The second column, and the reason it is not mostly empty: on a wide screen the deck's own
          status used to stack under a card that already runs to the bottom of the viewport, leaving
          this half holding one line of text. Under the deck on a phone, in the same order. */}
      <div className={RAIL}>
        <p className="mt-3 text-center text-sm text-muted tabular-nums lg:mt-0 lg:text-left">
          {index + 1} / {restaurants.length}
          {!superUsed && <span className="ml-2 text-grape">· ⭐ super</span>}
          {!vetoUsed && <span className="ml-2 text-flare">· 🚫 veto, kills it</span>}
        </p>
        {/* Every one of these already worked; nothing said so, and a key nobody knows about is a
          feature nobody has. Desktop only: there is no keyboard to speak of on the phone layout. */}
        <p className="mt-3 hidden items-center justify-center gap-2 text-2xs text-muted lg:flex lg:justify-start">
          <Key>←</Key> pass
          <Key>→</Key> eat
          {/* The cap dims, the word does not: fading the word too put it under 4.5:1, and dimming it
            far enough to be legible would have erased the difference it exists to show. */}
          <Key dim={superUsed}>↑</Key> super
          <Key dim={vetoUsed}>↓</Key> veto
          <Key dim={!canUndo}>⌫</Key> undo
        </p>
        {canUndo && (
          <button
            type="button"
            onClick={undoLast}
            className="mx-auto mt-2 block px-3 py-1 text-xs font-medium text-muted transition hover:text-cream hover:underline lg:mx-0"
          >
            Undo last vote
          </button>
        )}
        {aside}
      </div>

      {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
