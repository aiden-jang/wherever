import { RoomInvite } from "../components/RoomInvite.js";
import { FilterSummary } from "../components/FilterSummary.js";
import { DeckSkeleton } from "../components/DeckSkeleton.js";
import { PlateState } from "../components/PlateState.js";
import { Suspense, lazy, useEffect, useRef, useState, type Ref } from "react";
import { Link, useParams } from "react-router-dom";
import { line } from "@wherever/shared";
import { Toasts, useHostPromotionToasts, useJoinLeaveToasts, useOneShotToast } from "../components/toasts.js";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { isCompleteCode } from "@wherever/shared";
import { useWakeLock } from "../useWakeLock.js";
import { VibeDial } from "../components/VibeDial.js";

/*
 * The decided screen is the biggest thing here and nothing reaches it until a round ends. Split out,
 * then fetched while people are still swiping, so the reveal never waits on a network round trip.
 */
const MatchScreen = lazy(() =>
  import("../components/MatchScreen.js").then((m) => ({ default: m.MatchScreen })),
);
const loadSwipingRoom = () =>
  import("../components/SwipingRoom.js").then((m) => ({ default: m.SwipingRoom }));
const SwipingRoom = lazy(loadSwipingRoom);
import { ReactionBar } from "../components/Reactions.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { RoomChrome } from "../components/RoomChrome.js";
import { buzz } from "../components/haptics.js";

import { NamePrompt } from "../components/NamePrompt.js";
import { DisconnectBanner, HowItWorks } from "../components/LobbyStatus.js";
import { ParticipantChip } from "../components/LobbyPeople.js";

export default function Lobby() {
  const { code: rawCode = "" } = useParams();
  const code = rawCode.toUpperCase();

  const [name, setName] = useState(recallName);

  if (!isCompleteCode(code))
    return <InvalidRoom message="Check the six-character invite code and try again." />;

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
  useEffect(() => {
    if (deck?.length) void import("../components/MatchScreen.js").catch(() => undefined);
  }, [Boolean(deck?.length)]);
  const lobbyHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (session?.status === "lobby") lobbyHeading.current?.focus({ preventScroll: true });
  }, [session?.status]);
  useEffect(() => {
    if (error && !session) lobbyHeading.current?.focus({ preventScroll: true });
  }, [error, session]);
  const [announcement, setAnnouncement] = useState("");
  /*
   * The host's start button, closed for the round it is fetching. Cleared on either outcome: the
   * round begins, or Places failed and the host is meant to try again. `status` is in there so a
   * reconnect cannot leave the button dead.
   */
  const [starting, setStarting] = useState(false);
  const [resultPending, setResultPending] = useState(false);
  useEffect(() => setResultPending(false), [errorSeq, match, status, session?.status]);
  const [searching, setSearching] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);
  useEffect(() => setStarting(false), [session?.status, errorSeq, status]);

  /* Awake while there is a deck and no answer yet. Not in the lobby before the cards are dealt, and
     not after: holding the screen on for a decision already made is just draining a battery. */
  useWakeLock(session?.status === "swiping" && Boolean(deck?.length) && !match);
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
          ? `No eligible pick. ${match.vetoedCount} ${match.vetoedCount === 1 ? "place was" : "places were"} vetoed.`
          : "No place got a yes vote.",
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
  const chrome = {
    announcement,
    toasts: screenToasts,
    reactions,
    roster: session?.participants ?? [],
    demo,
    online: status === "open",
  };
  const count = session?.participants.length ?? 0;
  const hostPresent = session?.participants.some((participant) => participant.isHost);

  // An error before any session state means a bad or expired code.
  if (error && !session && !match) {
    return <InvalidRoom message={error} headingRef={lobbyHeading} />;
  }

  // The match outcome wins over everything else once it arrives.
  if (match) {
    return (
      <main id="main-content" tabIndex={-1} className="table-room">
        {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
        <RoomChrome {...chrome} />
        <Suspense fallback={<p className="text-muted">Counting…</p>}>
          <MatchScreen
            key={match.kind === "match" ? match.restaurant.id : "no-match"}
            match={match}
            visited={visited}
            filters={session?.filters}
            isHost={isHost}
            online={status === "open"}
            pending={resultPending}
            demo={Boolean(demo)}
            onAgain={(deck) => {
              setResultPending(send({ type: "again", deck }));
            }}
            onEditSearch={() => setResultPending(send({ type: "edit_search" }))}
            resultError={error}
            onChooseAlternative={(restaurantId) => {
              setResultPending(send({ type: "choose_alternative", restaurantId }));
            }}
            onNeverAgain={(restaurantId, neverAgain) =>
              send({ type: "set_never_again", restaurantId, neverAgain })
            }
          />
        </Suspense>
        {/* Keep the reaction bar mounted here: this is the one moment everyone is looking at the
            same thing. */}
        <div className="mt-4">
          <ReactionBar disabled={status !== "open"} onReact={(emoji) => send({ type: "react", emoji })} />
        </div>
      </main>
    );
  }

  if (session?.status === "decided") {
    return (
      <main id="main-content" tabIndex={-1} className="table-room">
        <h1 className="table-title">Loading the dinner result</h1>
        <p role="status" className="text-muted">
          The votes are in. Getting the result…
        </p>
        {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      </main>
    );
  }

  if (session?.status === "swiping") {
    return (
      <Suspense
        fallback={
          <main id="main-content" tabIndex={-1} className="table-room table-voting">
            <h1 className="table-title">Pick your dinner</h1>
            <DeckSkeleton />
          </main>
        }
      >
        <SwipingRoom state={state} chrome={chrome} onAnnounce={setAnnouncement} isHost={isHost} />
      </Suspense>
    );
  }

  if (!session) {
    return (
      <main id="main-content" tabIndex={-1} className="table-room">
        <h1 className="table-title">Joining the dinner room</h1>
        <p role="status">{status === "closed" ? "Couldn’t connect to the room." : "Connecting…"}</p>
        {status === "closed" && <DisconnectBanner reconnecting={false} />}
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="table-room">
      <header className="lobby-heading">
        <h1 ref={lobbyHeading} tabIndex={-1} className="table-title">
          Dinner room
        </h1>
        <p className="text-sm text-muted">
          {isHost ? "You’re hosting. Start when your group is ready." : "You’re in. Waiting on the host."}
        </p>
        {!isHost && !hostPresent && (
          <p className="mt-2 text-sm text-muted">
            The host is away. You can wait for them to return or{" "}
            <Link to="/?new=1" className="underline">
              start a new room
            </Link>
            .
          </p>
        )}
      </header>
      {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
      <LiveRegion message={announcement} />
      <Toasts toasts={allToasts} />
      <div className="table-layout table-lobby">
        <div className="lobby-main">
          <RoomInvite code={code} />
          <FilterSummary
            filters={session.filters}
            editable={isHost}
            locked={starting || status !== "open"}
            initiallyOpen={state.roundId > 0 && isHost}
            onSavingChange={setSavingFilters}
            onChange={(filters) => send({ type: "set_filters", filters })}
            onSearchPendingChange={setSearching}
            syncError={errorSeq}
          />
          {isHost && (
            <button
              type="button"
              onClick={() => {
                void loadSwipingRoom().catch(() => undefined);
                setStarting(send({ type: "start_round" }));
              }}
              disabled={starting || searching || savingFilters || status !== "open"}
              className="lobby-start rounded-xl bg-ember px-4 py-3 font-semibold text-ink hover:brightness-110 disabled:opacity-60"
            >
              {starting ? "Finding places…" : "Start swiping"}
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-flare">
              {error}
            </p>
          )}
        </div>
        <div className="table-rail">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold">At the table</h2>
                <p className="text-sm text-muted">
                  {count} {count === 1 ? "person" : "people"}
                </p>
              </div>
              <PlateState art="table" small />
            </div>
            <div className="flex flex-col gap-2">
              {session?.participants.length ? (
                session.participants.map((p) => <ParticipantChip key={p.id} p={p} />)
              ) : (
                <p className="text-muted text-sm">
                  {status === "connecting"
                    ? "Finding your people…"
                    : "Just you so far. That code won't share itself."}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <details className="lobby-preferences table-panel">
            <summary className="text-sm font-semibold">Group preferences</summary>
            <VibeDial
              disabled={starting || status !== "open"}
              counts={vibeCounts}
              mine={myVibe}
              groupSize={count}
              onPick={(vibe) => send({ type: "set_vibe", vibe })}
            />
          </details>
          <HowItWorks />
        </div>
      </div>
    </main>
  );
}

function InvalidRoom({ message, headingRef }: { message: string; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <main id="main-content" tabIndex={-1} className="table-room grid place-items-center text-center">
      <div className="table-panel max-w-sm">
        <PlateState />
        <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-state font-bold">
          This code leads nowhere.
        </h1>
        <p className="mt-3 text-muted">{message}</p>
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
