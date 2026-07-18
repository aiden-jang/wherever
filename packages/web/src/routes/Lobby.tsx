import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Participant, SessionFilters } from "@wherever/shared";
import { amenityLabel, cuisineLabel, neighborhoodLabel, PRICE_OPTIONS, RADIUS_OPTIONS, SORT_OPTIONS } from "@wherever/shared";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { SwipeDeck, DeckSkeleton } from "../components/SwipeDeck.js";
import { MatchScreen } from "../components/MatchScreen.js";
import { ReactionBar, FloatingReactions } from "../components/Reactions.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { buzz } from "../components/haptics.js";

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

function radiusLabel(meters: number): string {
  return RADIUS_OPTIONS.find((o) => o.meters === meters)?.label ?? `${Math.round(meters / 1000)} km`;
}

/** Read-only recap of the filters the host chose, so joiners know the game. */
function FilterSummary({ filters }: { filters: SessionFilters }) {
  const area = filters.area ? neighborhoodLabel(filters.area) : undefined;
  const chips: string[] = [
    area ? `${area} · ${radiusLabel(filters.radiusMeters)}` : radiusLabel(filters.radiusMeters),
    `up to ${PRICE_OPTIONS.find((o) => o.tier === filters.maxPriceTier)?.label ?? "$$$$"}`,
  ];
  if (filters.minRating && filters.minRating > 0) chips.push(`${filters.minRating.toFixed(1)}+ stars`);
  if (filters.minReviews && filters.minReviews > 0) chips.push(`${filters.minReviews}+ reviews`);
  if (filters.openNow) chips.push("open now");
  for (const a of filters.amenities ?? []) chips.push(amenityLabel(a).toLowerCase());
  if (filters.revealVoters) chips.push("votes shown");
  if (filters.sort === "distance") {
    const sortLabel = SORT_OPTIONS.find((o) => o.value === "distance")?.label ?? "closest";
    chips.push(sortLabel.toLowerCase());
  }
  chips.push(
    filters.categories.length > 0
      ? filters.categories.map(cuisineLabel).join(", ")
      : "any food",
  );

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-muted">
          {c}
        </span>
      ))}
    </div>
  );
}

/** Three-beat explainer for people who land here from a shared link and don't know the rules. */
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
          className="pop-in rounded-full bg-ink-soft/95 border border-white/10 px-4 py-2 text-sm font-medium shadow-lg"
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
      <span className={`font-medium ${p.connected ? "" : "text-muted"}`}>{p.displayName}</span>
      {p.isHost && (
        <span className="ml-auto rounded-full bg-acid/15 text-acid text-xs font-semibold px-2 py-0.5">
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
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {participants.map((p) => {
        const finished = done.has(p.id);
        return (
          <div
            key={p.id}
            className="relative"
            title={`${p.displayName} — ${finished ? "done" : "still deciding"}`}
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
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-ink bg-acid text-[9px] font-bold text-ink">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
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
      <p className="font-semibold text-cream">Demo mode — sample restaurants.</p>
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
  const { session, deck, demo, alreadyVoted, progress, match, visited, error, status, everConnected, participantId, reactions, send } =
    useSessionSocket(code, displayName);
  const [copied, setCopied] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const toasts = useJoinLeaveToasts(session?.participants, setAnnouncement);

  // Announce the verdict to screen readers when it lands.
  useEffect(() => {
    if (match?.kind === "match") {
      setAnnouncement(`Decided. Everyone's eating at ${match.restaurant.name}.`);
    } else if (match?.kind === "none") {
      setAnnouncement("Nobody liked anything.");
    }
  }, [match]);
  // Only surface a banner once we've connected at least once: "connecting" then is a drop,
  // not the initial handshake.
  const showBanner = everConnected && status !== "open";

  // Reflect the round in the tab title: the winner when decided, "Swiping" mid-round, else the
  // code. Findable among open tabs and a tiny bit of delight when it lands.
  useEffect(() => {
    document.title =
      match?.kind === "match"
        ? `🍽 ${match.restaurant.name} · Wherever, Honestly`
        : session?.status === "swiping"
          ? `Swiping · ${code}`
          : `${code} · Wherever, Honestly`;
  }, [code, session?.status, match]);
  useEffect(() => () => {
    document.title = "Wherever, Honestly";
  }, []);

  // Identify self by stable participantId, not display name (two people can share a name, which
  // would misattach host controls). Fall back to name only until identity arrives.
  const me = session?.participants.find((p) =>
    participantId ? p.id === participantId : p.displayName === displayName,
  );
  const isHost = me?.isHost ?? false;
  const hostToasts = useHostPromotionToasts(isHost, !!session, setAnnouncement);
  const allToasts = [...toasts, ...hostToasts];
  const count = session?.participants.length ?? 0;

  const [codeCopied, setCodeCopied] = useState(false);
  async function copyCode() {
    await navigator.clipboard.writeText(code).catch(() => {});
    buzz(8);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1200);
  }

  // Prefer the native share sheet (one tap to Messages/WhatsApp on mobile); fall back to copy.
  async function shareInvite() {
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wherever, Honestly",
          text: "Come decide where we're eating. Swipe on it:",
          url,
        });
        return;
      } catch {
        // User dismissed the sheet; fall through to copy.
      }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <LiveRegion message={announcement} />
        <MatchScreen
          match={match}
          visited={visited}
          isHost={isHost}
          onAgain={() => send({ type: "again" })}
        />
      </main>
    );
  }

  if (session?.status === "swiping") {
    return (
      <main className="relative flex-1 flex flex-col items-center justify-center px-6 py-10">
        {showBanner && <DisconnectBanner reconnecting={status === "connecting"} />}
        <LiveRegion message={announcement} />
        <Toasts toasts={allToasts} />
        <FloatingReactions reactions={reactions} />
        {demo && <DemoBanner />}
        {deck && deck.length > 0 ? (
          <>
            <SwipeDeck
              key={deck.map((r) => r.id).join(",")}
              restaurants={deck}
              alreadyVoted={alreadyVoted}
              onSwipe={(restaurantId, direction) =>
                send({ type: "swipe", restaurantId, direction })
              }
            />
            {session?.filters.revealVoters && progress?.finishedIds && session.participants.length > 0 && (
              <VoterAvatars participants={session.participants} finishedIds={progress.finishedIds} />
            )}
            {progress && progress.totalParticipants > 0 && (
              <p className="mt-6 text-sm text-muted">
                {progress.finishedCount} of {progress.totalParticipants} done
                {isHost && progress.finishedCount < progress.totalParticipants && (
                  <button
                    onClick={() => send({ type: "decide_now" })}
                    className="ml-3 underline hover:text-cream transition-colors"
                  >
                    just decide now
                  </button>
                )}
              </p>
            )}
            <div className="mt-6">
              <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
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
        <p className="mt-1 text-xs text-muted">{codeCopied ? "Copied the code." : "Tap the code to copy it"}</p>
        <button onClick={shareInvite} className="mt-4 rounded-full border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/5 active:scale-95 transition">
          {copied ? "Copied. Go paste it." : "Invite the group"}
        </button>
        {session?.filters && <FilterSummary filters={session.filters} />}
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
