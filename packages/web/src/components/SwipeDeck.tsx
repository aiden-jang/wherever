import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  line,
  type BallotChoice,
  type Restaurant,
  type SwipeDirection,
  type VisitedPlace,
} from "@wherever/shared";

import { VoteControls } from "./VoteControls.js";
import { RestaurantDetail } from "./RestaurantDetail.js";
import { PlateState } from "./PlateState.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";
import { swipeAnnouncement, undoAnnouncement, revisitNote } from "@wherever/shared";
import { useLine } from "../useLine.js";
import { useAppBadge } from "../useAppBadge.js";

import { ActiveSwipeCard } from "./ActiveSwipeCard.js";
import { PrivateShortlist } from "./PrivateShortlist.js";
import { useDeckKeys } from "./useDeckKeys.js";

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
  demo = false,
  alreadyVoted = [],
  ballot = [],
  undoAllowed,
  visited = [],
  superSpent = false,
  vetoSpent = false,
  onSwipe,
  onLoadPlace,
  onUndo,
  onAnnounce,
  aside,
}: {
  restaurants: Restaurant[];
  disabled?: boolean;
  demo?: boolean;
  onLoadPlace: (id: string) => void;
  alreadyVoted?: string[];
  ballot?: BallotChoice[];
  undoAllowed?: boolean;
  /** Where the group has already been, so a place out of cooldown says so instead of arriving as new. */
  visited?: VisitedPlace[];
  superSpent?: boolean;
  /** Seeded from the server so a reconnect can't hand back a spent veto. */
  vetoSpent?: boolean;
  onSwipe: (choice: BallotChoice) => boolean;
  // The deck owns its status rail; the group panel joins it on desktop and follows it on phones.
  aside?: ReactNode;
  onUndo: (choice: BallotChoice) => boolean;
  onAnnounce?: (text: string) => void;
}) {
  const historyRef = useRef(ballot);
  const restoredVotes = useMemo(
    () => new Set(alreadyVoted.filter((id) => !ballot.some((choice) => choice.restaurantId === id))),
    [alreadyVoted, ballot],
  );
  const nextUnvoted = useCallback(
    (after: number) => {
      for (let index = after + 1; index < restaurants.length; index += 1) {
        const id = restaurants[index]!.id;
        if (!restoredVotes.has(id) && !historyRef.current.some((choice) => choice.restaurantId === id))
          return index;
      }
      return restaurants.length;
    },
    [restaurants, restoredVotes],
  );
  const [index, setIndex] = useState(() => nextUnvoted(-1));
  // One super-like per round; seeded from the server (survives reconnect) then set locally on use.
  const [superUsed, setSuperUsed] = useState(superSpent);
  const [vetoUsed, setVetoUsed] = useState(vetoSpent);
  const [choices, setChoices] = useState(ballot);
  const [undoAvailable, setUndoAvailable] = useState(undoAllowed ?? ballot.length > 0);
  const undoAvailableRef = useRef(undoAvailable);
  const canUndo = undoAvailable && choices.length > 0;
  useAppBadge(Math.max(0, restaurants.length - restoredVotes.size - choices.length));
  // The card whose full details are open in the sheet (null = closed). Tapping a card opens it;
  // it never blocks voting since a drag isn't a tap.
  const [detail, setDetail] = useState<{ restaurant: Restaurant; photoIndex: number } | null>(null);

  const openDetail = useCallback((restaurant: Restaurant, photoIndex = 0) => {
    setDetail({ restaurant, photoIndex });
  }, []);

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
      if (
        !current ||
        current.detailsStatus === "pending" ||
        (current.detailsStatus && (dir !== "left" || isVeto))
      )
        return;
      const choice = {
        restaurantId: current.id,
        choiceId: crypto.randomUUID(),
        direction: dir,
        super: isSuper,
        veto: isVeto,
      };
      if (!onSwipe(choice)) return;
      undoAvailableRef.current = true;
      setUndoAvailable(true);
      const next = nextUnvoted(i);
      if (restaurants[next]?.detailsStatus === "pending") {
        document.activeElement?.closest("main")?.focus({ preventScroll: true });
      }
      indexRef.current = next;
      // A firmer triple-buzz for a super-like; light on a like, double on a pass.
      buzz(isVeto ? [20, 40, 20, 40] : isSuper ? [12, 30, 12] : dir === "right" ? 12 : [8, 20]);
      play(isVeto ? "veto" : isSuper ? "superLike" : dir === "right" ? "like" : "pass");
      if (isSuper) setSuperUsed(true);
      if (isVeto) setVetoUsed(true);
      historyRef.current = [...historyRef.current, choice];
      setChoices(historyRef.current);
      dismissHint();
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

  const undoButton = useRef<HTMLButtonElement>(null);
  const undoLast = useCallback(() => {
    if (disabled || !undoAvailableRef.current) return;
    const previous = historyRef.current.at(-1);
    if (!previous || !onUndo(previous)) return;
    const previousIndex = restaurants.findIndex((restaurant) => restaurant.id === previous.restaurantId);
    if (previousIndex < 0) return;
    historyRef.current = historyRef.current.slice(0, -1);
    undoAvailableRef.current = false;
    setUndoAvailable(false);
    if (undoButton.current === document.activeElement) {
      undoButton.current?.closest("main")?.focus({ preventScroll: true });
    }
    indexRef.current = previousIndex;
    setIndex(previousIndex);
    if (previous.super) setSuperUsed(false);
    if (previous.veto) setVetoUsed(false);
    setChoices(historyRef.current);
    buzz(8);
    const back = restaurants[previousIndex];
    if (back) onAnnounce?.(undoAnnouncement(back.name, previousIndex + 1, restaurants.length));
  }, [disabled, onUndo, onAnnounce, restaurants]);

  useDeckKeys({ disabled, detailOpen: Boolean(detail), canUndo, superUsed, vetoUsed, commit, undoLast });

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
      ref={undoButton}
      type="button"
      data-deck-control
      onClick={undoLast}
      disabled={disabled}
      className="vote-undo inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium enabled:hover:underline disabled:opacity-60"
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
            <PrivateShortlist liked={likedChoices} restaurants={restaurants} onOpen={openDetail} />
          )}
        </div>
        {/* Waiting on other people is exactly when their progress is worth looking at. */}
        {aside && <div className={RAIL}>{aside}</div>}
        {detail && (
          <RestaurantDetail
            restaurant={detail.restaurant}
            initialPhotoIndex={detail.photoIndex}
            demo={demo}
            onClose={() => setDetail(null)}
          />
        )}
      </div>
    );
  }

  const active = restaurants[index]!;

  return (
    <div className="table-layout">
      <div className="meal-card table-card" style={{ viewTransitionName: "chosen-card" } as CSSProperties}>
        <div className={dealing ? "deal-in" : undefined}>
          <ActiveSwipeCard
            key={active.id}
            disabled={disabled}
            onLoadPlace={onLoadPlace}
            onAnnounce={onAnnounce}
            restaurant={active}
            revisit={revisitNote(visited, active.id)}
            onCommit={commit}
            onOpenDetail={openDetail}
          />
        </div>
        <VoteControls
          disabled={disabled}
          detailsStatus={active.detailsStatus}
          vetoUsed={vetoUsed}
          superUsed={superUsed}
          onVote={commit}
          onSpent={saySpent}
          undo={undoControl}
        />

        {/* Reserve one feedback slot so vote controls stay under the user’s finger. */}
        <p className={`table-vote-feedback ${spentNote ? "table-vote-warning" : ""}`} aria-live="polite">
          {spentNote ??
            (showHint && !active.detailsStatus ? "Swipe or tap a vote. Tap the card for details." : "")}
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
            V
          </Key>
          <Key label="undo" dim={!canUndo}>
            ⌫
          </Key>
        </p>
        {aside}
      </div>

      {detail && (
        <RestaurantDetail
          restaurant={detail.restaurant}
          initialPhotoIndex={detail.photoIndex}
          demo={demo}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
