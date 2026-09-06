import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { decideNowWarning, line } from "@wherever/shared";
import { Toasts, useHostPromotionToasts, useJoinLeaveToasts, useOneShotToast } from "../components/toasts.js";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { useAppBadge } from "../useAppBadge.js";
import { useWakeLock } from "../useWakeLock.js";
import { VibeDial } from "../components/VibeDial.js";
import { SwipeDeck, DeckSkeleton } from "../components/SwipeDeck.js";
/*
 * The decided screen is the biggest thing here and nothing reaches it until a round ends. Split out,
 * then fetched while people are still swiping, so the reveal never waits on a network round trip.
 */
const MatchScreen = lazy(() =>
  import("../components/MatchScreen.js").then((m) => ({ default: m.MatchScreen })),
);
import { ReactionBar, FloatingReactions } from "../components/Reactions.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { RoomChrome } from "../components/RoomChrome.js";
import { buzz } from "../components/haptics.js";
import { play } from "../components/sound.js";
import { FilterSummary } from "../components/FilterSummary.js";
import { JoinQr } from "../components/JoinQr.js";
import { NamePrompt } from "../components/NamePrompt.js";
import {
  DemoBanner,
  DisconnectBanner,
  HowItWorks,
  RoundCountdown,
  WaitingDots,
} from "../components/LobbyStatus.js";
import { GroupTasteMap, LiveVotes, ParticipantChip, VoterAvatars } from "../components/LobbyPeople.js";

export default function Lobby() {
  const { code = "" } = useParams();

  // Fetch the decided screen during the round, so its reveal is never a loading state.
  useEffect(() => {
    void import("../components/MatchScreen.js");
  }, []);
  const [name, setName] = useState(recallName());

  if (!name) {
    return (
      <NamePrompt
        onSubmit={(n) => {
          rememberName(n);
          setName(n);
        }}
      />
    );
  }
  return <LobbyRoom code={code} displayName={name} />;
}

function LobbyRoom({ code, displayName }: { code: string; displayName: string }) {
  const {
    session,
    deck,
    demo,
    deckNote,
    behindBy,
    nudges,
    superUsed,
    vetoUsed,
    roundEndsAt,
    alreadyVoted,
    progress,
    match,
    vibeCounts,
    myVibe,
    visited,
    error,
    errorSeq,
    status,
    everConnected,
    participantId,
    reactions,
    send,
  } = useSessionSocket(code, displayName);
  const [announcement, setAnnouncement] = useState("");
  /*
   * The host's start button, closed for the round it is fetching. Cleared on either outcome: the
   * round begins, or Places failed and the host is meant to try again. `status` is in there so a
   * reconnect cannot leave the button dead.
   */
  const [starting, setStarting] = useState(false);
  useEffect(() => setStarting(false), [session?.status, errorSeq, status]);

  /* Cards this person still owes the room, on the icon while they are looking at something else.
     Cleared once decided: a badge for a decision already made is a lie on the home screen. */
  useAppBadge(match ? 0 : Math.max(0, (deck?.length ?? 0) - alreadyVoted.length));
  /* Awake while there is a deck and no answer yet. Not in the lobby before the cards are dealt, and
     not after: holding the screen on for a decision already made is just draining a battery. */
  useWakeLock(Boolean(deck?.length) && !match);
  const toasts = useJoinLeaveToasts(session?.participants, setAnnouncement);

  // Announce the verdict to screen readers when it lands.
  useEffect(() => {
    if (match?.kind === "match") {
      setAnnouncement(`Decided. Everyone's eating at ${match.restaurant.name}.`);
    } else if (match?.kind === "none") {
      // Has to say the same thing the screen does. Announcing "nobody liked anything" after a round
      // decided by vetoes tells a screen-reader user the one wrong reason, and they have no picture
      // to correct it against.
      setAnnouncement(
        match.vetoedCount > 0
          ? `Everything got vetoed. ${match.vetoedCount} ${match.vetoedCount === 1 ? "place" : "places"} struck off.`
          : "Nobody liked anything.",
      );
    }
  }, [match]);
  // Only surface a banner once we've connected at least once: "connecting" then is a drop,
  // not the initial handshake.
  const showBanner = everConnected && status !== "open";

  // Reflect the round in the tab title: the winner when decided, "Swiping" mid-round, else just
  // the app name. (The session code is deliberately kept out of the tab.)
  useEffect(() => {
    document.title =
      match?.kind === "match"
        ? `🍽 ${match.restaurant.name} · Wherever, Honestly`
        : session?.status === "swiping"
          ? `Swiping · Wherever, Honestly`
          : `Wherever, Honestly`;
  }, [session?.status, match]);
  useEffect(
    () => () => {
      document.title = "Wherever, Honestly";
    },
    [],
  );

  // Identify self by stable participantId, not display name (two people can share a name, which
  // would misattach host controls). Fall back to name only until identity arrives.
  const me = session?.participants.find((p) =>
    participantId ? p.id === participantId : p.displayName === displayName,
  );
  const isHost = me?.isHost ?? false;
  /*
   * The floating overlay is aria-hidden, so a veto or a super-like was silent for a screen reader.
   * Named neither the place nor the person, matching what goes on the wire.
   */
  const lastVerdict = useRef<string | null>(null);
  useEffect(() => {
    const verdict = [...reactions].reverse().find((r) => r.kind);
    if (!verdict || lastVerdict.current === verdict.id) return;
    lastVerdict.current = verdict.id;
    setAnnouncement(
      verdict.kind === "veto"
        ? "Somebody vetoed a place. It is out for everyone."
        : "Somebody super-liked one.",
    );
  }, [reactions]);

  // A nudge is aimed at you personally, so it buzzes as well as speaks.
  const nudgeToasts = useOneShotToast(nudges > 0 ? line("nudged", nudges) : null, setAnnouncement);
  useEffect(() => {
    if (nudges > 0) buzz([14, 60, 14]);
  }, [nudges]);

  const hostToasts = useHostPromotionToasts(isHost, !!session, setAnnouncement);
  const deckToasts = useOneShotToast(deckNote, setAnnouncement);
  const behindToasts = useOneShotToast(
    behindBy > 0
      ? `They started without you, ${behindBy} ${behindBy === 1 ? "card" : "cards"} in. Your votes still count.`
      : null,
    setAnnouncement,
  );
  const allToasts = [...toasts, ...hostToasts, ...deckToasts, ...behindToasts, ...nudgeToasts];
  /*
   * The server's refusals, on the screens that had nowhere to put them.
   *
   * `error` is rendered as a line of text on the create/lobby screen only. Everywhere else it was
   * set and never shown: hitting the round limit on "run it back" pressed a button and watched
   * nothing happen, with no reason given.
   */
  const errorToasts = useOneShotToast(error, setAnnouncement, error ? `error-${errorSeq}` : null);
  const screenToasts = [...allToasts, ...errorToasts];
  const chrome = { announcement, toasts: screenToasts, reactions, roster: session?.participants ?? [], demo };
  const count = session?.participants.length ?? 0;

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
  const hurryWait = Math.max(0, 10 - Math.floor((now - hurriedAt) / 1000));
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeCopyFailed, setCodeCopyFailed] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"sharing" | "shared" | "copied" | "failed" | null>(null);
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      setCodeCopyFailed(true);
      setTimeout(() => setCodeCopyFailed(false), 2200);
      return;
    }
    buzz(8);
    play("tap");
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1200);
  }

  const finishInvite = (status: "shared" | "copied"): void => {
    setInviteStatus(status);
    window.setTimeout(() => setInviteStatus(null), 2200);
  };

  async function copyInviteLink(): Promise<void> {
    if (inviteStatus) return;
    setInviteStatus("sharing");
    try {
      await navigator.clipboard.writeText(location.href);
      buzz(8);
      play("tap");
      finishInvite("copied");
    } catch {
      setInviteStatus("failed");
      window.setTimeout(() => setInviteStatus(null), 2600);
    }
  }

  // Open the phone's native share sheet with the invite link (the natural way to fire it into a
  // group chat). A browser without it falls back to the clipboard; closing the native sheet is a
  // deliberate choice and returns the lobby to its idle state without an alarming error.
  async function shareInvite() {
    if (inviteStatus) return;
    buzz(8);
    play("tap");
    const url = location.href;
    setInviteStatus("sharing");
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wherever, Honestly",
          text: "Come help pick where we're eating.",
          url,
        });
        finishInvite("shared");
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setInviteStatus(null);
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      finishInvite("copied");
    } catch {
      setInviteStatus("failed");
      window.setTimeout(() => setInviteStatus(null), 2600);
    }
  }

  // An error before any session state means a bad or expired code.
  if (error && !session && !match) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-glyph">🫥</div>
          <h1 className="mt-4 font-display text-state font-bold">This code leads nowhere.</h1>
          <p className="mt-3 text-muted">{error}</p>
          <Link
            to="/"
            className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Start a fresh session
          </Link>
        </div>
      </main>
    );
  }

  // The match outcome wins over everything else once it arrives.
  if (match) {
    return (
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-10">
        <RoomChrome {...chrome} />
        <Suspense fallback={<p className="text-muted">Counting…</p>}>
          <MatchScreen
            key={match.kind === "match" ? match.restaurant.id : "no-match"}
            match={match}
            visited={visited}
            filters={session?.filters}
            isHost={isHost}
            onAgain={(deck) => send({ type: "again", deck })}
            onChooseAlternative={(restaurantId) => send({ type: "choose_alternative", restaurantId })}
            onNeverAgain={(restaurantId, neverAgain) =>
              send({ type: "set_never_again", restaurantId, neverAgain })
            }
          />
        </Suspense>
        {/* The one moment everyone is looking at the same thing, and the reaction bar used to
            disappear exactly then. */}
        <div className="mt-4">
          <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
        </div>
      </main>
    );
  }

  if (session?.status === "swiping") {
    /*
     * Tighter vertical rhythm here than on the other screens, because this one has to fit.
     *
     * The swiping column ran 68px to 768px, and a 1280x720 laptop cut it off at 720 — so the
     * reaction bar, the only signal during a round that anyone else is in the session at all, was
     * below the fold and effectively did not exist. On a phone the 80px of overflow lands exactly
     * where the browser chrome does, so the space came out of the gaps.
     *
     * From `lg` up the group half moves beside the deck instead of under it. That fills a screen
     * that was a 384px card adrift in 1280px of gradient, and it buys back the vertical room, which
     * is what lets the card finally be the size of the thing the whole app is about.
     */
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
              onAnnounce={setAnnouncement}
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
            <div className="text-glyph">🍽️</div>
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

  return (
    <main className="flex-1 flex flex-col items-center px-6 pb-16 w-full max-w-md mx-auto">
      {/* Same reason as the swiping screen: the code is the loudest thing here, but it is a button. */}
      <h1 className="sr-only">Session {code}. Waiting to start.</h1>
      {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      <LiveRegion message={announcement} />
      <Toasts toasts={allToasts} />
      <div className="w-full text-center mt-4">
        <p className="text-sm text-muted">Share this code. Or the link. Whatever is less effort.</p>
        <button
          onClick={copyCode}
          aria-label="Copy the session code"
          className="mt-3 block w-full font-display text-5xl font-extrabold tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-ember via-flare to-grape active:scale-95 transition"
        >
          {code}
        </button>
        <p className="mt-1 text-xs text-muted">
          {codeCopied
            ? "Copied the code."
            : codeCopyFailed
              ? "Couldn’t copy it. Select the code instead."
              : "Tap the code to copy it"}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void shareInvite()}
            disabled={inviteStatus !== null}
            aria-live="polite"
            className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/5 active:scale-95 transition disabled:cursor-default disabled:opacity-60"
          >
            {inviteStatus === "sharing"
              ? "Opening…"
              : inviteStatus === "shared"
                ? "Invite sent"
                : inviteStatus === "copied"
                  ? "Link copied"
                  : inviteStatus === "failed"
                    ? "Couldn’t copy link"
                    : "Invite the group"}
          </button>
          <button
            type="button"
            onClick={() => void copyInviteLink()}
            disabled={inviteStatus !== null}
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-muted hover:border-white/20 hover:text-cream transition disabled:cursor-default disabled:opacity-60"
          >
            Copy link
          </button>
        </div>
        <JoinQr code={code} url={location.href} />
        {/* The rules live here now, not in the create modal: the group can see them, and somebody is
            waiting for people to join anyway. Host-only to change, since they are one shared deck. */}
        {session?.filters && (
          <FilterSummary
            filters={session.filters}
            editable={isHost}
            onChange={(filters) => send({ type: "set_filters", filters })}
          />
        )}
      </div>

      {/* Above the participant list, because it is the thing to do while waiting for people to arrive.
          Below the join code, because getting everyone in still comes first. */}
      <div className="w-full">
        <VibeDial
          counts={vibeCounts}
          mine={myVibe}
          groupSize={session?.participants.length ?? 0}
          onPick={(vibe) => send({ type: "set_vibe", vibe })}
        />
      </div>

      <HowItWorks />

      <div className="w-full mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold">The committee</h2>
          <span className="text-sm text-muted">
            {count} {count === 1 ? "opinion" : "opinions"}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {session?.participants.length ? (
            session.participants.map((p) => <ParticipantChip key={p.id} p={p} />)
          ) : (
            <p className="text-muted text-sm">
              {status === "connecting"
                ? "Finding your people..."
                : "Just you so far. That code won't share itself."}
            </p>
          )}
        </div>
      </div>

      <div className="w-full mt-10">
        {isHost ? (
          <button
            onClick={() => {
              setStarting(true);
              send({ type: "start_round" });
            }}
            disabled={starting}
            className="w-full rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink shadow-lg shadow-ember/30 transition-transform disabled:opacity-60 enabled:hover:scale-[1.02]"
          >
            {starting ? "Finding places..." : "Start swiping"}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-muted">
            <div className="flex items-center gap-2">
              <WaitingDots />
              <span className="font-medium">Waiting on the host.</span>
            </div>
            <p className="text-sm">Gentle peer pressure is an option.</p>
          </div>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-flare">{error}</p>}
    </main>
  );
}
