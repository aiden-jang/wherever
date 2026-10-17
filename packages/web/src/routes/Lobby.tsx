import { RoomInvite } from "../components/RoomInvite.js";
import { SwipingRoom } from "../components/SwipingRoom.js";
import { PlateState } from "../components/PlateState.js";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { line } from "@wherever/shared";
import { Toasts, useHostPromotionToasts, useJoinLeaveToasts, useOneShotToast } from "../components/toasts.js";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { useAppBadge } from "../useAppBadge.js";
import { useWakeLock } from "../useWakeLock.js";
import { VibeDial } from "../components/VibeDial.js";

/*
 * The decided screen is the biggest thing here and nothing reaches it until a round ends. Split out,
 * then fetched while people are still swiping, so the reveal never waits on a network round trip.
 */
const MatchScreen = lazy(() =>
  import("../components/MatchScreen.js").then((m) => ({ default: m.MatchScreen })),
);
import { ReactionBar } from "../components/Reactions.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { RoomChrome } from "../components/RoomChrome.js";
import { buzz } from "../components/haptics.js";

import { NamePrompt } from "../components/NamePrompt.js";
import { DisconnectBanner, HowItWorks } from "../components/LobbyStatus.js";
import { ParticipantChip } from "../components/LobbyPeople.js";

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
  return <LobbyRoom key={code} code={code} displayName={name} />;
}

function LobbyRoom({ code, displayName }: { code: string; displayName: string }) {
  const state = useSessionSocket(code, displayName);
  const {
    session,
    deck,
    demo,
    deckNote,
    behindBy,
    nudges,
    alreadyVoted,
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
  } = state;
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
  const showBanner = status === "closed" || (everConnected && status !== "open");

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
  // Refusals outside the create/lobby form still need visible feedback.
  const errorToasts = useOneShotToast(error, setAnnouncement, error ? `error-${errorSeq}` : null);
  const screenToasts = [...allToasts, ...errorToasts];
  const chrome = { announcement, toasts: screenToasts, reactions, roster: session?.participants ?? [], demo };
  const count = session?.participants.length ?? 0;

  // An error before any session state means a bad or expired code.
  if (error && !session && !match) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <PlateState />
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
        {/* Keep the reaction bar mounted here: this is the one moment everyone is looking at the
            same thing. */}
        <div className="mt-4">
          <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
        </div>
      </main>
    );
  }

  if (session?.status === "swiping")
    return <SwipingRoom state={state} chrome={chrome} onAnnounce={setAnnouncement} isHost={isHost} />;

  return (
    <main className="lobby-screen flex-1 flex flex-col items-center px-6 pb-16 w-full max-w-md mx-auto">
      {/* Same reason as the swiping screen: the code is the loudest thing here, but it is a button. */}
      <h1 className="sr-only">Session {code}. Waiting to start.</h1>
      {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      <LiveRegion message={announcement} />
      <Toasts toasts={allToasts} />
      <RoomInvite code={code} filters={session?.filters} isHost={isHost} send={send} />

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
          <h2 className="font-display text-xl font-bold">At the table</h2>
          <span className="text-sm text-muted">
            {count} {count === 1 ? "person" : "people"}
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
        {isHost && (
          <p className="mb-3 text-center text-sm text-muted">Everyone here? Start when you’re ready.</p>
        )}
        {isHost ? (
          <button
            onClick={() => {
              setStarting(true);
              send({ type: "start_round" });
            }}
            disabled={starting}
            className="w-full rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink transition-transform disabled:opacity-60 enabled:hover:scale-[1.02]"
          >
            {starting ? "Finding places..." : "Start swiping"}
          </button>
        ) : (
          <div className="lobby-wait flex flex-col items-center gap-2 text-center text-muted">
            <div className="flex items-center gap-2">
              <PlateState small />
              <span className="font-medium">
                {session
                  ? "You’re in. Waiting on the host."
                  : status === "closed"
                    ? "The session is unavailable."
                    : "Connecting to the session…"}
              </span>
            </div>
            <p className="text-sm">Gentle peer pressure is an option.</p>
          </div>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-flare">{error}</p>}
    </main>
  );
}
