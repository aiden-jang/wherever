import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { line, type Restaurant, type SwipeDirection, type VisitedPlace } from "@wherever/shared";

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
function Key({ children, label, dim = false }: { children: ReactNode; label: string; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <kbd
        className={`rounded border px-1.5 py-0.5 font-sans ${
          dim ? "border-dashed border-white/20 text-muted" : "border-white/20 bg-white/5 text-cream"
        }`}
      >
        {children}
      </kbd>
      {label}
    </span>
  );
}

const RAIL = "table-rail";

export function SwipeDeck({
  restaurants,
  disabled = false,
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
  disabled?: boolean;
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
  const restoredVotes = useMemo(() => new Set(alreadyVoted), [alreadyVoted]);
  const nextUnvoted = useCallback(
    (after: number) => {
      for (let index = after + 1; index < restaurants.length; index += 1) {
        if (!restoredVotes.has(restaurants[index]!.id)) return index;
      }
      return restaurants.length;
    },
    [restaurants, restoredVotes],
  );
  const [index, setIndex] = useState(() => nextUnvoted(-1));
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
      if (disabled) return;
      const i = indexRef.current;
      const current = restaurants[i];
      if (!current) return;
      const next = nextUnvoted(i);
      indexRef.current = next;
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
          next: restaurants[next]?.name ?? null,
          position: next + 1,
          total: restaurants.length,
        }),
      );
      setIndex(next);
    },
    [disabled, restaurants, onSwipe, onAnnounce, dismissHint, nextUnvoted],
  );

  const undoLast = useCallback(() => {
    if (disabled) return;
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
  }, [disabled, onUndo, onAnnounce, restaurants]);

  // Desktop: arrow keys swipe. Suspended while the detail sheet is open so arrows don't vote the
  // card behind it (the sheet has its own concerns, e.g. dismissing).
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useLayoutEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (
        disabled ||
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
        window.getSelection()?.isCollapsed === false ||
        !(e.target instanceof HTMLElement && e.target.closest("#main-content")) ||
        Boolean(e.target.closest("[data-card-info]"))
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
  }, [canUndo, commit, detail, disabled, superUsed, undoLast, vetoUsed]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const done = index >= restaurants.length;
  const waitingLine = useLine("waiting");
  const waitingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (done) waitingHeading.current?.focus();
  }, [done]);

  // Only the first deal animates. Replacing a restaurant after a vote keeps the controls steady.
  const [dealing, setDealing] = useState(true);
  useEffect(() => {
    play("deal");
    const t = setTimeout(() => setDealing(false), 700);
    return () => clearTimeout(t);
  }, []);

  const likedChoices = choices.filter((choice) => choice.direction === "right");

  const undoControl = canUndo && (
    <button
      type="button"
      data-deck-control
      onClick={undoLast}
      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-muted transition hover:text-cream hover:underline"
    >
      Undo last vote
    </button>
  );

  if (done) {
    return (
      <div className="table-layout">
        <div className="table-panel text-center">
          <PlateState art="waiting" />
          <h2 ref={waitingHeading} tabIndex={-1} className="mt-4 font-display text-3xl font-bold">
            Waiting for the group
          </h2>
          <p className="mt-2 text-muted">{waitingLine}</p>
          {undoControl}
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
                            <span className="min-w-0 [overflow-wrap:anywhere] font-medium">
                              {restaurant.name}
                            </span>
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

  const active = restaurants[index]!;

  return (
    <div className="table-layout">
      <div className="meal-card table-card" style={{ viewTransitionName: "chosen-card" } as CSSProperties}>
        <div className={dealing ? "deal-in" : undefined}>
          <SwipeCard
            key={active.id}
            restaurant={active}
            revisit={revisitNote(visited, active.id)}
            onCommit={commit}
            onOpenDetail={setDetail}
          />
        </div>
        <VoteControls
          disabled={disabled}
          vetoUsed={vetoUsed}
          superUsed={superUsed}
          onVote={commit}
          onSpent={saySpent}
        />

        {/* Reserve one feedback slot so vote controls stay under the user’s finger. */}
        <p className={`table-vote-feedback ${spentNote ? "table-vote-warning" : ""}`} aria-live="polite">
          {spentNote ?? (showHint ? "Swipe or tap a vote. Tap the card for details." : "")}
        </p>
      </div>

      <div className={RAIL}>
        <p className="text-sm text-muted tabular-nums">
          Place {index + 1} of {restaurants.length}
        </p>
        <p className="mt-3 hidden flex-wrap gap-x-3 gap-y-1 text-xs text-muted lg:flex">
          <Key label="pass">←</Key>
          <Key label="eat">→</Key>
          <Key label="super" dim={superUsed}>
            ↑
          </Key>
          <Key label="veto" dim={vetoUsed}>
            ↓
          </Key>
          <Key label="undo" dim={!canUndo}>
            ⌫
          </Key>
        </p>
        {undoControl}
        {aside}
      </div>

      {detail && <RestaurantDetail restaurant={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
