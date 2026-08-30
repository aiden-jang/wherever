import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { decideNowWarning, line } from "@wherever/shared";
import type { Participant, TastePulse } from "@wherever/shared";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { VibeDial } from "../components/VibeDial.js";
import { SwipeDeck, DeckSkeleton } from "../components/SwipeDeck.js";
import { MatchScreen } from "../components/MatchScreen.js";
import { ReactionBar, FloatingReactions } from "../components/Reactions.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { buzz } from "../components/haptics.js";
import { play } from "../components/sound.js";
import { FilterSummary } from "../components/FilterSummary.js";
import { JoinQr } from "../components/JoinQr.js";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="font-display text-3xl font-bold">And you are?</h1>
        <p className="mt-2 text-muted">The group needs a name to overrule.</p>
        <input
          className="mt-6 w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors"
          placeholder="Your name"
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()} className="mt-3 w-full rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition">
          Join the session
        </button>
      </form>
    </main>
  );
}

function DisconnectBanner({ reconnecting }: { reconnecting: boolean }) {
  if (reconnecting) {
    return (
      <div className="fixed top-0 inset-x-0 z-40 bg-white/10 backdrop-blur text-cream text-center text-sm font-medium py-2">
        Connection dropped. Reconnecting...
      </div>
    );
  }
  return (
    <div className="fixed top-0 inset-x-0 z-40 bg-flare/90 text-ink text-center text-sm font-medium py-2">
      Still can&apos;t reach the session.{" "}
      <button onClick={() => location.reload()} className="underline font-semibold">
        Reload to rejoin
      </button>
    </div>
  );
}

/**
 * Three-beat explainer for people who land here from a shared link and don't know the rules.
 *
 * The veto gets its own line rather than a fourth card. "Majority rules" is no longer the whole
 * truth, and somebody who never learns the exception either never spends their veto or watches
 * their pick vanish without knowing why — but three beats is the joke, and a fourth column would
 * squeeze all of them on a phone.
 */
function HowItWorks() {
  const steps = [
    { emoji: "👆", label: "Everyone swipes" },
    { emoji: "🗳️", label: "Majority rules" },
    { emoji: "🍽️", label: "Nobody's fault" },
  ];
  return (
    <div className="w-full mt-10 grid grid-cols-3 gap-2">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 border border-white/10 px-2 py-4 text-center"
        >
          <span className="text-2xl">{s.emoji}</span>
          <span className="text-xs font-semibold text-muted">
            {i + 1}. {s.label}
          </span>
        </div>
      ))}
      <p className="col-span-3 mt-3 text-center text-xs text-muted">
        🚫 One veto each. It kills a place outright, however many people wanted it.
      </p>
    </div>
  );
}

interface Toast {
  id: string;
  text: string;
}

/** Fixed toast stack for join/leave events. */
function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 inset-x-0 z-40 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pop-in rounded-full bg-ink-soft/95 border border-white/10 px-4 py-2 text-sm font-medium shadow-lifted"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Toasts when someone joins or leaves, by diffing the participant list across session_state
 * pushes. The first snapshot seeds silently so existing members don't all toast on load.
 */
function useJoinLeaveToasts(
  participants: Participant[] | undefined,
  onEvent?: (text: string) => void,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<Map<string, string> | null>(null);
  // Keep the latest callback without re-running the diff effect when it changes identity.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!participants) return;
    const curr = new Map(participants.map((p) => [p.id, p.displayName]));
    const before = prev.current;
    prev.current = curr;
    if (before === null) return; // seed silently

    const events: string[] = [];
    for (const [id, name] of curr) if (!before.has(id)) events.push(`${name} joined`);
    for (const [id, name] of before) if (!curr.has(id)) events.push(`${name} left`);
    if (events.length === 0) return;

    onEventRef.current?.(events.join(". "));
    if (curr.size > before.size) play("join");
    const added = events.map((text) => ({ id: crypto.randomUUID(), text }));
    setToasts((t) => [...t, ...added]);
    const ids = new Set<string>(added.map((a) => a.id));
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 3000);
  }, [participants]);

  return toasts;
}

/**
 * A one-off toast when *you* become the host (the previous host left and the server handed it off).
 * Seeds silently once the session is known, so the original host isn't toasted on load.
 */
function useHostPromotionToasts(
  isHost: boolean,
  ready: boolean,
  onEvent?: (text: string) => void,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<boolean | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!ready) return;
    const before = prev.current;
    prev.current = isHost;
    if (before === null) return; // seed silently on first known state
    if (before || !isHost) return; // only fire on a false -> true handoff

    const text = "You're the host now. You can start swiping.";
    onEventRef.current?.(text);
    const toast = { id: crypto.randomUUID(), text };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 4000);
  }, [isHost, ready]);

  return toasts;
}

/*
 * Say something once, when it becomes true, and never again for the same words.
 *
 * Used for the two things the deck screen has to explain without taking a permanent row: what the
 * group's vibe did to the filters, and that you have walked in on a round already under way. That
 * screen has to fit on a laptop without pushing the reaction bar under the fold.
 */
function useOneShotToast(
  text: string | null,
  onEvent?: (text: string) => void,
  /** What counts as "the same thing again". Defaults to the words; errors key on a counter instead. */
  key: string | null = text,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const said = useRef<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!text || !key || said.current === key) return;
    said.current = key;
    onEventRef.current?.(text);
    const toast = { id: crypto.randomUUID(), text };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 5000);
  }, [key, text]);

  return toasts;
}

/*
 * The one thing on this screen that moves when somebody else does.
 *
 * Everything else about the group is near-static during a round: the avatars sit there, and
 * `finishedCount` only ticks when a whole deck is done, which can be minutes apart. A plain count of
 * votes cast changes on every swipe by anyone, so it is the only continuous sign that you are not
 * swiping alone. Keyed on the number so the pulse restarts each time one lands.
 */
function LiveVotes({ count }: { count: number }) {
  if (count <= 0) return <p className="mt-3 text-sm text-muted">No votes yet.</p>;
  return (
    <p className="mt-3 text-sm text-muted">
      <span key={count} className="vote-tick inline-block font-semibold text-cream tabular-nums">
        {count}
      </span>{" "}
      {count === 1 ? "vote" : "votes"} in
    </p>
  );
}

function ParticipantChip({ p }: { p: Participant }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
      <span className="relative grid place-items-center h-10 w-10 rounded-full bg-gradient-to-br from-ember to-flare text-ink font-bold">
        {initials(p.displayName)}
        {/* Live presence: solid green pulse when connected, hollow grey when they've dropped. */}
        <span
          role="img"
          aria-label={p.connected ? "connected" : "disconnected"}
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink ${
            p.connected ? "bg-acid animate-pulse" : "bg-transparent border-muted"
          }`}
          title={p.connected ? "here" : "disconnected"}
        />
      </span>
      {/* min-w-0 + break so the name is what gives on a narrow screen. Without it a 24-character
          unbroken name refuses to shrink and shoves the host badge past the right edge of the
          phone — the row looked fine, and the whole page scrolled sideways. */}
      <span className={`min-w-0 break-words font-medium ${p.connected ? "" : "text-muted"}`}>
        {p.displayName}
      </span>
      {p.isHost && (
        <span className="ml-auto shrink-0 rounded-full bg-acid/15 text-acid text-xs font-semibold px-2 py-0.5">
          host
        </span>
      )}
    </div>
  );
}

/**
 * Reveal-voters mode: a row of participant avatars during the round, each lighting up with a check
 * once that person has finished swiping. Only rendered when the host enabled it (and the server
 * therefore sent finishedIds), so anonymous sessions never show identities.
 */
function VoterAvatars({
  participants,
  finishedIds,
}: {
  participants: Participant[];
  finishedIds: string[];
}) {
  const done = new Set(finishedIds);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {participants.map((p) => {
        const finished = done.has(p.id);
        return (
          <div
            key={p.id}
            className="relative"
            title={`${p.displayName}: ${finished ? "done" : "still deciding"}`}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold transition-colors ${
                finished
                  ? "bg-gradient-to-br from-ember to-flare text-ink"
                  : "bg-white/10 text-muted"
              }`}
            >
              {initials(p.displayName)}
            </span>
            {finished && (
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-ink bg-acid text-2xs font-bold text-ink">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Anonymous live texture for the round. It deliberately cannot name a person or restaurant. */
function GroupTasteMap({ pulse }: { pulse: TastePulse }) {
  const appetite = pulse.rightRate < 30 ? "selective" : pulse.rightRate < 60 ? "curious" : "easy crowd";
  const aligned = pulse.strongestOverlap >= Math.max(2, Math.ceil(pulse.activeVoters * 0.6));
  const overlap = aligned ? "same wavelength" : pulse.strongestOverlap >= 2 ? "a little spark" : "still exploring";
  const price = pulse.averagePriceTier === null
    ? "no yeses yet"
    : "$".repeat(Math.max(1, Math.min(4, Math.round(pulse.averagePriceTier))));

  return (
    <div
      className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs"
      aria-label={`Anonymous group pulse: ${appetite}, ${overlap}, leaning ${price}`}
      title="Built from anonymous totals. No names or restaurants are revealed."
    >
      <span className="font-semibold text-ember">group pulse</span>
      <span className="text-muted">{appetite}</span>
      <span aria-hidden className="text-white/20">·</span>
      <span className="text-muted">{overlap}</span>
      <span aria-hidden className="text-white/20">·</span>
      <span className="font-semibold tracking-wide text-cream">{price}</span>
    </div>
  );
}

/** Live round countdown from an absolute deadline; goes red in the final stretch, then "Deciding…". */
function RoundCountdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, endsAt - Date.now())), 500);
    return () => clearInterval(t);
  }, [endsAt]);

  if (remaining <= 0) {
    return <p className="mb-4 text-sm font-semibold text-flare">Time! Deciding…</p>;
  }
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const low = totalSec <= 10;
  return (
    <p
      className={`mb-4 text-sm font-semibold tabular-nums ${low ? "text-flare animate-pulse" : "text-muted"}`}
    >
      ⏱ {m}:{String(s).padStart(2, "0")} left
    </p>
  );
}

/** Three softly pulsing dots — a small sign of life so "waiting on the host" doesn't read as frozen. */
function WaitingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Shown when the deck is the sample fallback: the project's monthly live-data budget (kept inside
 * Google's free tier so the demo costs nothing) is spent, so we serve stand-in restaurants. Framed
 * as "still totally playable" rather than an error.
 */
function DemoBanner() {
  return (
    <div className="w-full max-w-sm mx-auto mb-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm">
      <p className="font-semibold text-cream">Demo mode: sample restaurants.</p>
      <p className="mt-0.5 text-muted">
        This project hit its monthly Google API budget, so the live data is off. Everything still
        works; real spots are back on the 1st.
      </p>
    </div>
  );
}

export default function Lobby() {
  const { code = "" } = useParams();
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
  const { session, deck, demo, vibeEffect, behindBy, nudges, superUsed, vetoUsed, roundEndsAt, alreadyVoted, progress, match, planned, arrivals, vibeCounts, myVibe, visited, error, errorSeq, status, everConnected, participantId, reactions, send } =
    useSessionSocket(code, displayName);
  const [announcement, setAnnouncement] = useState("");
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
  useEffect(() => () => {
    document.title = "Wherever, Honestly";
  }, []);

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
  const vibeToasts = useOneShotToast(vibeEffect, setAnnouncement);
  const behindToasts = useOneShotToast(
    behindBy > 0
      ? `They started without you, ${behindBy} ${behindBy === 1 ? "card" : "cards"} in. Your votes still count.`
      : null,
    setAnnouncement,
  );
  const allToasts = [...toasts, ...hostToasts, ...vibeToasts, ...behindToasts, ...nudgeToasts];
  /*
   * The server's refusals, on the screens that had nowhere to put them.
   *
   * `error` is rendered as a line of text on the create/lobby screen only. Everywhere else it was
   * set and never shown: a host picking a meetup time in the past, or hitting the round limit on
   * "run it back", pressed a button and watched nothing happen with no reason given.
   */
  const errorToasts = useOneShotToast(error, setAnnouncement, error ? `error-${errorSeq}` : null);
  const screenToasts = [...allToasts, ...errorToasts];
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
  const hurryWait = Math.max(0, 20 - Math.floor((now - hurriedAt) / 1000));
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeCopyFailed, setCodeCopyFailed] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'sharing' | 'shared' | 'copied' | 'failed' | null>(null);
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

  const finishInvite = (status: 'shared' | 'copied'): void => {
    setInviteStatus(status);
    window.setTimeout(() => setInviteStatus(null), 2200);
  };

  async function copyInviteLink(): Promise<void> {
    if (inviteStatus) return;
    setInviteStatus('sharing');
    try {
      await navigator.clipboard.writeText(location.href);
      buzz(8);
      play('tap');
      finishInvite('copied');
    } catch {
      setInviteStatus('failed');
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
    setInviteStatus('sharing');
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wherever, Honestly",
          text: "Come help pick where we're eating.",
          url,
        });
        finishInvite('shared');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setInviteStatus(null);
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      finishInvite('copied');
    } catch {
      setInviteStatus('failed');
      window.setTimeout(() => setInviteStatus(null), 2600);
    }
  }

  // An error before any session state means a bad or expired code.
  if (error && !session && !match) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-6xl">🫥</div>
          <h1 className="mt-4 font-display text-4xl font-bold">This code leads nowhere.</h1>
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
        <LiveRegion message={announcement} />
        <Toasts toasts={screenToasts} />
        <FloatingReactions
          reactions={reactions}
          roster={(session?.participants ?? []).map((p) => p.id)}
        />
        <MatchScreen
          key={match.kind === "match" ? match.restaurant.id : "no-match"}
          match={match}
          visited={visited}
          filters={session?.filters}
          isHost={isHost}
          planned={planned}
          arrivals={arrivals}
          participants={session?.participants ?? arrivals.map((arrival) => ({
            id: arrival.participantId,
            displayName: arrival.displayName,
            isHost: false,
            connected: true,
          }))}
          participantId={participantId}
          onAgain={() => send({ type: "again" })}
          onChooseAlternative={(restaurantId) => send({ type: "choose_alternative", restaurantId })}
          onPlan={(nextPlan) => send({ type: "set_plan", planned: nextPlan })}
          onNeverAgain={(restaurantId, neverAgain) =>
            send({ type: "set_never_again", restaurantId, neverAgain })
          }
          onArrival={(arrivalStatus, travelMinutes) => send({
            type: "set_arrival",
            status: arrivalStatus,
            ...(travelMinutes ? { travelMinutes } : {}),
          })}
        />
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
        <LiveRegion message={announcement} />
        <Toasts toasts={screenToasts} />
        <FloatingReactions
          reactions={reactions}
          roster={(session?.participants ?? []).map((p) => p.id)}
        />
        {demo && <DemoBanner />}
        {roundEndsAt && <RoundCountdown endsAt={roundEndsAt} />}
        {deck && deck.length > 0 ? (
          <>
            <div className="w-full lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center lg:gap-12">
              <div className="min-w-0">
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
              />
              </div>
              {/* Everything about the group, beside the deck rather than under it on a wide
                  screen: it fills the empty half and buys back the vertical room this screen
                  never has. */}
              <div className="min-w-0 lg:flex lg:flex-col lg:items-start lg:gap-1 lg:text-left">
              {progress?.tastePulse && <GroupTasteMap pulse={progress.tastePulse} />}
              {session?.filters.revealVoters && progress?.finishedIds && session.participants.length > 0 && (
                <VoterAvatars participants={session.participants} finishedIds={progress.finishedIds} />
              )}
              {progress && <LiveVotes count={progress.votesCast ?? 0} />}
              {progress && progress.totalParticipants > 0 && (
                <p className="mt-3 text-sm text-muted tabular-nums">
                  {progress.finishedCount} of {progress.totalParticipants} done
                  {isHost && progress.finishedCount < progress.totalParticipants && !confirmDecide && (
                    <button
                      disabled={hurryWait > 0}
                      onClick={() => {
                        send({ type: "nudge_them" });
                        setHurriedAt(Date.now());
                        setNow(Date.now());
                      }}
                      className="ml-3 underline transition-colors hover:text-cream disabled:cursor-default disabled:no-underline disabled:opacity-50 disabled:hover:text-muted"
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
                          className="ml-3 underline hover:text-cream transition-colors"
                        >
                          Wait
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDecide(true)}
                        className="ml-3 underline hover:text-cream transition-colors"
                      >
                        just decide now
                      </button>
                    ))}
                </p>
              )}
              <div className="mt-3">
                <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
              </div>
              </div>
            </div>
          </>
        ) : deck ? (
          <div className="text-center max-w-sm">
            <div className="text-6xl">🍽️</div>
            <h1 className="mt-4 font-display text-3xl font-bold">Nothing survived the filters.</h1>
            <p className="mt-2 text-muted">
              Your standards met this neighborhood and won. Try again with a wider radius or fewer
              filters.
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
          {codeCopied ? "Copied the code." : codeCopyFailed ? "Couldn’t copy it. Select the code instead." : "Tap the code to copy it"}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => void shareInvite()}
            disabled={inviteStatus !== null}
            aria-live="polite"
            className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/5 active:scale-95 transition disabled:cursor-default disabled:opacity-60"
          >
            {inviteStatus === 'sharing'
              ? 'Opening…'
              : inviteStatus === 'shared'
                ? 'Invite sent'
                : inviteStatus === 'copied'
                  ? 'Link copied'
                  : inviteStatus === 'failed'
                    ? 'Couldn’t copy link'
                    : 'Invite the group'}
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
          <span className="text-sm text-muted">{count} {count === 1 ? "opinion" : "opinions"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {session?.participants.length ? (
            session.participants.map((p) => <ParticipantChip key={p.id} p={p} />)
          ) : (
            <p className="text-muted text-sm">
              {status === "connecting" ? "Finding your people..." : "Just you so far. That code won't share itself."}
            </p>
          )}
        </div>
      </div>

      <div className="w-full mt-10">
        {isHost ? (
          <button
            onClick={() => send({ type: "start_round" })}
            className="w-full rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink shadow-lg shadow-ember/30 hover:scale-[1.02] transition-transform"
          >
            Start swiping
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
