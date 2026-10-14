import { useEffect, useState, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { decideNowWarning, NUDGE_COOLDOWN_MS } from "@wherever/shared";
import type { useSessionSocket } from "../useSessionSocket.js";
import { PlateState } from "./PlateState.js";
import { DisconnectBanner, RoundCountdown } from "./LobbyStatus.js";
import { RoomChrome } from "./RoomChrome.js";
import { SwipeDeck } from "./SwipeDeck.js";
import { DeckSkeleton } from "./DeckSkeleton.js";
import { GroupTasteMap, LiveVotes, VoterAvatars } from "./LobbyPeople.js";
import { ReactionBar } from "./Reactions.js";
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
    visited,
    superUsed,
    vetoUsed,
    progress,
    send,
  } = state;
  const showBanner = everConnected && status !== "open";
  const [confirmDecide, setConfirmDecide] = useState(false);
  /*
   * Mirrors the server's cooldown so the button shows the rule instead of failing silently. The
   * server is still the enforcement: socket errors are not rendered during a round, so a second
   * click would otherwise do nothing visible at all.
   */
  const [hurriedAt, setHurriedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hurriedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [hurriedAt]);
  const hurryWait = Math.max(0, NUDGE_COOLDOWN_MS / 1000 - Math.floor((now - hurriedAt) / 1000));

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-4">
      {/*
          Hidden, because the card is the whole design and a visible title would only take space
          from it. It still has to exist: this screen had no heading of any level, so anyone
          navigating by headings landed in the middle of a round with nothing to orient on.
        */}
      <h1 className="sr-only">Swiping. Vote on tonight&apos;s places.</h1>
      {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      <RoomChrome {...chrome} />
      {roundEndsAt && <RoundCountdown endsAt={roundEndsAt} />}
      {deck && deck.length > 0 ? (
        <>
          {/* The group panel is handed to the deck rather than placed beside it: the deck owns
                the round state, so it is the only thing that can put its own status in the same
                column on a wide screen instead of stacking it under a card that is already tall. */}
          <SwipeDeck
            key={deck.map((r) => r.id).join(",")}
            restaurants={deck}
            alreadyVoted={alreadyVoted}
            visited={visited}
            superSpent={superUsed}
            vetoSpent={vetoUsed}
            onSwipe={(restaurantId, direction, isSuper, isVeto) =>
              send({ type: "swipe", restaurantId, direction, super: isSuper, veto: isVeto })
            }
            onUndo={(restaurantId) => send({ type: "undo_swipe", restaurantId })}
            onAnnounce={onAnnounce}
            aside={
              <>
                {progress?.tastePulse && <GroupTasteMap pulse={progress.tastePulse} />}
                {session?.filters.revealVoters &&
                  progress?.finishedIds &&
                  session.participants.length > 0 && (
                    <VoterAvatars participants={session.participants} finishedIds={progress.finishedIds} />
                  )}
                {progress && <LiveVotes count={progress.votesCast ?? 0} />}
                {progress && progress.totalParticipants > 0 && (
                  <p className="mt-3 text-sm text-muted tabular-nums">
                    {progress.finishedCount} of {progress.totalParticipants} done
                    {/* -my-2 py-2 on the inline actions here: 20px tall is under the 24px tap floor on a
                          phone, and these hurry or end a round. The negative margin keeps the line as it was. */}
                    {isHost && progress.finishedCount < progress.totalParticipants && !confirmDecide && (
                      <button
                        disabled={hurryWait > 0}
                        onClick={() => {
                          send({ type: "nudge_them" });
                          setHurriedAt(Date.now());
                          setNow(Date.now());
                        }}
                        className="ml-3 -my-2 py-2 underline transition-colors hover:text-cream disabled:cursor-default disabled:no-underline disabled:opacity-50 disabled:hover:text-muted"
                      >
                        {hurryWait > 0 ? `hurried (${hurryWait}s)` : "hurry them"}
                      </button>
                    )}
                    {isHost &&
                      progress.finishedCount < progress.totalParticipants &&
                      (confirmDecide ? (
                        /* Two steps in the same row: this ends the round for everybody, and the screen
                             cannot afford another line. */
                        <>
                          <span className="ml-3 text-cream">
                            {decideNowWarning(progress.finishedCount, progress.totalParticipants)}
                          </span>
                          <button
                            onClick={() => {
                              setConfirmDecide(false);
                              send({ type: "decide_now" });
                            }}
                            className="ml-3 font-semibold text-acid underline hover:text-cream transition-colors"
                          >
                            Decide anyway
                          </button>
                          <button
                            onClick={() => setConfirmDecide(false)}
                            className="ml-3 -my-2 py-2 underline hover:text-cream transition-colors"
                          >
                            Wait
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDecide(true)}
                          className="ml-3 -my-2 py-2 underline hover:text-cream transition-colors"
                        >
                          just decide now
                        </button>
                      ))}
                  </p>
                )}
                <div className="mt-3">
                  <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
                </div>
              </>
            }
          />
        </>
      ) : deck ? (
        <div className="text-center max-w-sm">
          <PlateState />
          <h1 className="mt-4 font-display text-state font-bold">Nothing survived the filters.</h1>
          <p className="mt-2 text-muted">
            Your standards met this neighborhood and won. Try again with a wider radius or fewer filters.
          </p>
          <Link
            to="/"
            className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Start a fresh session
          </Link>
        </div>
      ) : (
        <DeckSkeleton />
      )}
    </main>
  );
}
