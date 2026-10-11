import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { line, type Restaurant, type SwipeDirection, type VisitedPlace } from "@wherever/shared";
import { categoryLabel, priceLabel, reviewCountLabel } from "./cardStyle.js";
import { CardFace } from "./CardFace.js";
import { VoteControls } from "./VoteControls.js";
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
      className="absolute inset-0 meal-card rounded-card shadow-raised overflow-hidden cursor-grab active:cursor-grabbing"
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
      <div className="relative h-[clamp(340px,52dvh,410px)] lg:h-[clamp(360px,64dvh,520px)]">
        <div
          className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse"
          style={{ transform: "scale(0.95) translateY(14px)" }}
        />
        <div className="absolute inset-0 meal-card rounded-card overflow-hidden animate-pulse">
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

  /*
   * First-run gesture hint: shown once ever, then remembered.
   *
   * The first swipe dismisses it and nothing else does. Don't add a timeout: five seconds is about
   * how long the line takes to read, and less than a first-timer spends looking at the restaurant
   * rather than the hint. A swipe is the signal that it landed.
   */
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
   * Don't mark the veto or the super-like `disabled`: it swallows the click, so tapping a spent
   * one twice gives only silence and the button reads as broken. `aria-disabled` keeps it
   * focusable and clickable so it can answer for itself.
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
        <div className="relative h-[clamp(340px,52dvh,410px)] lg:h-[clamp(360px,64dvh,520px)]">
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
                  className="absolute inset-0 meal-card rounded-card overflow-hidden transition-transform duration-200"
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

        {/*
         * One slot for both, at a height it always occupies.
         *
         * Two conditional paragraphs would jump the buttons down as either appeared and back up when it
         * went, and a control that moves as you reach for it is worse than the message is useful.
         * would otherwise carry this is `lg:` only, so a phone has nowhere else to read it.
         */}
        <p
          className={`mt-4 flex h-8 items-center justify-center px-4 text-center text-xs ${
            spentNote ? "text-flare" : showHint ? "animate-pulse text-muted" : "text-muted"
          }`}
          aria-live="polite"
        >
          {spentNote ?? (showHint ? "Swipe or tap a vote. Tap the card for details." : "")}
        </p>

        <VoteControls vetoUsed={vetoUsed} superUsed={superUsed} onVote={commit} onSpent={saySpent} />
      </div>

      {/* The second column, and the reason it is not mostly empty: on a wide screen the deck's own
          status stacked under a card runs to the bottom of the viewport and leaves this half
          holding one line of text. Under the deck on a phone, in the same order. */}
      <div className={RAIL}>
        <p className="mt-3 text-center text-sm text-muted tabular-nums lg:mt-0 lg:text-left">
          {index + 1} / {restaurants.length}
          {/* The buttons name themselves; what a label cannot fit is that the veto is absolute. */}
          {!vetoUsed && <span className="ml-2 text-flare">· 🚫 kills it outright</span>}
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
