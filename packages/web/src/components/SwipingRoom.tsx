import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { MotionConfig } from "framer-motion";
import { Link } from "react-router-dom";
import type { useSessionSocket } from "../useSessionSocket.js";
import { PlateState } from "./PlateState.js";
import { DisconnectBanner, RoundCountdown } from "./LobbyStatus.js";
import { RoomChrome } from "./RoomChrome.js";
import { SwipeDeck } from "./SwipeDeck.js";
import { DeckSkeleton } from "./DeckSkeleton.js";
import { GroupTasteMap, LiveVotes, VoterAvatars } from "./LobbyPeople.js";
import { ReactionBar } from "./Reactions.js";
import { RoundProgress } from "./RoundProgress.js";
export function SwipingRoom({
  state,
  chrome,
  onAnnounce,
  isHost,
}: {
  state: ReturnType<typeof useSessionSocket>;
  chrome: ComponentProps<typeof RoomChrome>;
  onAnnounce: (text: string) => void;
  isHost: boolean;
}) {
  const {
    session,
    status,
    everConnected,
    deck,
    roundEndsAt,
    alreadyVoted,
    ballot,
    visited,
    superUsed,
    vetoUsed,
    progress,
    send,
  } = state;
  const roundId = state.roundId;
  const loadPlace = useCallback(
    (restaurantId: string) => send({ type: "load_round_place", restaurantId, roundId }),
    [send, roundId],
  );
  const main = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    (heading.current ?? main.current)?.focus();
  }, []);
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (!roundEndsAt) return;
    const timer = setTimeout(() => setExpiredDeadline(roundEndsAt), Math.max(0, roundEndsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [roundEndsAt]);
  const votingPaused =
    status !== "open" ||
    (roundEndsAt !== null && (expiredDeadline === roundEndsAt || Date.now() >= roundEndsAt));
  const showBanner = everConnected && status !== "open";
  const groupRound = (progress?.totalParticipants ?? session?.participants.length ?? 1) > 1;

  return (
    <main ref={main} id="main-content" tabIndex={-1} className="table-room table-voting">
      {(!deck || deck.length > 0) && (
        <h1 ref={heading} tabIndex={-1} className="table-title">
          Pick your dinner
        </h1>
      )}
      {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      <RoomChrome {...chrome} />
      {roundEndsAt && (
        <RoundCountdown
          endsAt={roundEndsAt}
          onTurnOff={
            !votingPaused ? () => send({ type: "turn_off_timer", roundId: state.roundId }) : undefined
          }
        />
      )}
      {deck && deck.length > 0 ? (
        <>
          {/* The group panel is handed to the deck rather than placed beside it: the deck owns
                the round state, so it is the only thing that can put its own status in the same
                column on a wide screen instead of stacking it under a card that is already tall. */}
          <MotionConfig reducedMotion="user">
            <SwipeDeck
              key={state.deckRevision}
              disabled={votingPaused}
              demo={Boolean(state.demo)}
              restaurants={deck}
              onLoadPlace={loadPlace}
              alreadyVoted={alreadyVoted}
              ballot={ballot}
              undoAllowed={state.canUndo}
              visited={visited}
              superSpent={superUsed}
              vetoSpent={vetoUsed}
              groupRound={groupRound}
              onSwipe={(choice) => send({ type: "swipe", ...choice })}
              onUndo={(choice) =>
                send({
                  type: "undo_swipe",
                  restaurantId: choice.restaurantId,
                  choiceId: choice.choiceId ?? null,
                })
              }
              onAnnounce={onAnnounce}
              aside={
                <>
                  {groupRound && progress && (
                    <RoundProgress progress={progress} isHost={isHost} disabled={votingPaused} send={send} />
                  )}
                  {groupRound && progress && <LiveVotes count={progress.votesCast ?? 0} />}
                  {groupRound && progress?.tastePulse && <GroupTasteMap pulse={progress.tastePulse} />}
                  {groupRound &&
                    session?.filters.revealVoters &&
                    progress?.finishedIds &&
                    session.participants.length > 0 && (
                      <VoterAvatars participants={session.participants} finishedIds={progress.finishedIds} />
                    )}
                  <div className="mt-3">
                    <ReactionBar
                      disabled={status !== "open"}
                      onReact={(emoji) => send({ type: "react", emoji })}
                    />
                  </div>
                </>
              }
            />
          </MotionConfig>
        </>
      ) : deck ? (
        <div className="text-center max-w-sm">
          <PlateState art="search" />
          <h1 className="mt-4 font-display text-state font-bold">No places match these filters.</h1>
          <p className="mt-2 text-muted">Try a wider area or fewer filters.</p>
          <Link
            to="/"
            className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Create a new room
          </Link>
        </div>
      ) : (
        <DeckSkeleton />
      )}
    </main>
  );
}
