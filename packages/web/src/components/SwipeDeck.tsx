import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { line, type Restaurant, type SwipeDirection, type VisitedPlace } from "@wherever/shared";

import { CARD_SIZE, DECK_LAYOUT } from "./cardStyle.js";
import { CardFace } from "./CardFace.js";
import { VoteControls } from "./VoteControls.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { PlateState } from "./PlateState.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";
import { swipeAnnouncement, undoAnnouncement, revisitNote } from "@wherever/shared";
import { useLine } from "../useLine.js";

import { SwipeCard } from "./SwipeCard.js";

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

const RAIL = "mx-auto w-full min-w-0 max-w-sm lg:mx-0 lg:max-w-none lg:text-left";

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
  // The deck owns its status rail; the group panel joins it on desktop and follows it on phones.
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

  // A first swipe confirms the hint was understood; a timeout cannot establish that.
  const [showHint, setShowHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  // Keep spent actions focusable so they can explain their limit when pressed.
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
      if (
        detail ||
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        e.altKey ||
        e.shiftKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input, textarea, select, button:not([data-deck-control]), a, [contenteditable]:not([contenteditable="false"])',
          )) ||
        window.getSelection()?.isCollapsed === false
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() !== "z") return;
      if ((e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z")) && canUndo) {
        e.preventDefault();
        undoLast();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        commit("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        commit("right");
      } else if (e.key === "ArrowUp" && !superUsed) {
        e.preventDefault();
        commit("right", true);
      } else if (e.key === "ArrowDown" && !vetoUsed) {
        e.preventDefault();
        commit("left", false, true);
      }
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
      <div className={DECK_LAYOUT}>
        <div className="text-center max-w-sm mx-auto mt-10">
          <PlateState art="waiting" />
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
    <div className={DECK_LAYOUT}>
      <div className="mx-auto w-full min-w-0 max-w-sm lg:mx-0 lg:max-w-none">
        <div className={CARD_SIZE}>
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

          {/* Render only the active card so outgoing cards cannot retain focus or gestures. */}
          {/* Named for the view transition into the match screen: the browser pairs this box with the
            one in `MatchScreen` carrying the same name and tweens between them. `contents` cannot
            carry it - a box is required - so the name goes on the wrapper that has one. */}
          <div
            className={dealing ? "deal-in absolute inset-0" : "contents"}
            style={{ viewTransitionName: "chosen-card" } as CSSProperties}
          >
            <SwipeCard
              key={restaurants[index]!.id}
              restaurant={restaurants[index]!}
              revisit={revisitNote(visited, restaurants[index]!.id)}
              onCommit={commit}
              onOpenDetail={setDetail}
            />
          </div>
        </div>

        {/* Reserve one feedback slot so vote controls stay under the user’s finger. */}
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
            data-deck-control
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
