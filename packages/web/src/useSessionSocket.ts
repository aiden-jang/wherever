import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  ClientMessage,
  DecisionAlternative,
  Restaurant,
  ServerMessage,
  Vibe,
  Session,
  TastePulse,
  VisitedPlace,
  DemoReason,
} from "@wherever/shared";

type Status = "connecting" | "open" | "closed";

export interface Progress {
  finishedCount: number;
  totalParticipants: number;
  /** Ids of participants who've finished; present only in reveal-voters sessions. */
  finishedIds?: string[];
  tastePulse?: TastePulse;
  /** Every vote cast this round, by anyone. Moves on every swipe. */
  votesCast?: number;
}

export type MatchState =
  | {
      kind: "match";
      restaurant: Restaurant;
      rightSwipes: number;
      alternatives: DecisionAlternative[];
      totalParticipants: number;
      vetoedCount: number;
      tiedWith: number;
      vetoedTop: boolean;
      superTipped: boolean;
      round: number;
    }
  | { kind: "none"; vetoedCount: number }
  | null;

/** A reaction floating on screen; auto-removed after its animation. */
export interface FloatingReaction {
  id: string;
  emoji: string;
  from: string;
  /** Stable id of the sender, so two people with one name still get their own lane. */
  fromId?: string;
  /** A consequence rather than chatter, and shown as one. */
  kind?: "veto" | "super";
}

/**
 * A stable id per session code, so a reconnect keeps the same identity and votes.
 *
 * Must not throw: this runs inside `onopen` to build the join message, and where a browser blocks site
 * data even touching sessionStorage raises - then the join is never sent and the app sits on
 * "connecting" forever. The in-memory fallback holds identity across reconnects, just not a refresh.
 */
const fallbackClientIds = new Map<string, string>();

function clientIdFor(code: string): string {
  const key = `cid:${code}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    let id = fallbackClientIds.get(key);
    if (!id) {
      id = crypto.randomUUID();
      fallbackClientIds.set(key, id);
    }
    return id;
  }
}

/**
 * Owns the WebSocket to a session's Durable Object: connects, sends `join` with
 * a stable clientId, and surfaces server-pushed state (session, deck, progress,
 * match).
 */
/**
 * A state update inside a view transition, where the browser has one. Not the router's: this swap is
 * a websocket message arriving, so nothing else would start one. Skipped under reduced motion.
 */
function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || still) return update();
  doc.startViewTransition(() => flushSync(update));
}

export function useSessionSocket(code: string, displayName: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [deck, setDeck] = useState<Restaurant[] | null>(null);
  // True when the deck is the sample fallback served because the monthly live-data budget is spent.
  const [demo, setDemo] = useState<DemoReason | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState<string[]>([]);
  // Whether this client already spent its super-like this round (seeded from the deck on reconnect).
  const [superUsed, setSuperUsed] = useState(false);
  /* One line for everything that happened to the search before this deck was dealt. Two states would
     be two toasts racing each other, and both facts belong to the same moment. */
  const [deckNote, setDeckNote] = useState<string | null>(null);
  const [behindBy, setBehindBy] = useState(0);
  // Counter, not a boolean: a second nudge has to be distinguishable from the first.
  const [nudges, setNudges] = useState(0);
  const [vetoUsed, setVetoUsed] = useState(false);
  // Absolute epoch-ms deadline when the round auto-decides (null = no timer this round).
  const [roundEndsAt, setRoundEndsAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [match, setMatch] = useState<MatchState>(null);
  // Tallies for the group and this client's own pick. The server never sends anybody else's.
  const [vibeCounts, setVibeCounts] = useState<Partial<Record<Vibe, number>>>({});
  const [myVibe, setMyVibe] = useState<Vibe | null>(null);
  const [visited, setVisited] = useState<VisitedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorSeq, setErrorSeq] = useState(0);
  const [status, setStatus] = useState<Status>("connecting");
  const [everConnected, setEverConnected] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  // Messages sent while the socket is mid-reconnect are buffered here and flushed on reopen, so a
  // vote cast during a blip isn't silently dropped (which would stall the round for everyone).
  const outboxRef = useRef<ClientMessage[]>([]);

  useEffect(() => {
    if (!code || !displayName) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    // In prod the Worker may live on another origin; in dev Vite proxies /ws.
    const wsBase = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;

    let disposed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_ATTEMPTS = 6;

    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      switch (msg.type) {
        case "session_state":
          return setSession(msg.session);
        case "deck":
          // A fresh deck means a new round: clear any prior match outcome.
          setMatch(null);
          setProgress(null);
          setDeck(msg.restaurants);
          setDemo(msg.demo ?? null);
          setDeckNote([msg.vibeEffect, msg.searchNote].filter(Boolean).join(" ") || null);
          setBehindBy(msg.behindBy ?? 0);
          setSuperUsed(msg.superUsed ?? false);
          setVetoUsed(msg.vetoUsed ?? false);
          setRoundEndsAt(msg.roundEndsAt ?? null);
          return setAlreadyVoted(msg.alreadyVoted ?? []);
        case "vote_progress":
          return setProgress({
            finishedCount: msg.finishedCount,
            totalParticipants: msg.totalParticipants,
            finishedIds: msg.finishedIds,
            tastePulse: msg.tastePulse,
            votesCast: msg.votesCast,
          });
        case "match":
          /*
           * Through a transition, so the chosen card grows into the result instead of the screen swapping.
           * `SwipeDeck` and `MatchScreen` give their hero the same `view-transition-name` and the browser
           * matches them across the two DOMs.
           *
           * `flushSync` is required: React batches by default, so otherwise the transition captures the old
           * DOM, resolves, and animates nothing.
           */
          return withTransition(() =>
            setMatch({
              kind: "match",
              restaurant: msg.restaurant,
              rightSwipes: msg.rightSwipes,
              alternatives: msg.alternatives ?? [],
              totalParticipants: msg.totalParticipants,
              vetoedCount: msg.vetoedCount ?? 0,
              tiedWith: msg.tiedWith ?? 0,
              vetoedTop: msg.vetoedTop ?? false,
              superTipped: msg.superTipped ?? false,
              round: msg.round ?? 1,
            }),
          );
        case "nudge":
          return setNudges((n) => n + 1);
        case "no_match":
          return setMatch({ kind: "none", vetoedCount: msg.vetoedCount ?? 0 });
        case "history":
          return setVisited(msg.visited);
        case "vibes":
          setVibeCounts(msg.counts);
          return setMyVibe(msg.yours);
        case "reaction": {
          const id = crypto.randomUUID();
          setReactions((prev) => [
            ...prev,
            {
              id,
              emoji: msg.emoji,
              from: msg.from,
              ...(msg.fromId ? { fromId: msg.fromId } : {}),
              ...(msg.kind ? { kind: msg.kind } : {}),
            },
          ]);
          // Drop it after the float animation so the list can't grow unbounded.
          setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4500);
          return;
        }
        case "identity":
          return setParticipantId(msg.participantId);
        case "error":
          setError(msg.message);
          // Bumped so the same refusal twice in a row is still two events. Screens that show errors
          // as a toast dedupe on this; without it, "pick a time that hasn't happened yet" would
          // appear once and then stay silent however many times the host tried it.
          setErrorSeq((n) => n + 1);
          return;
      }
    };

    const connect = () => {
      const ws = new WebSocket(`${wsBase}/ws/${code}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempts = 0;
        setStatus("open");
        setEverConnected(true);
        ws.send(
          JSON.stringify({
            type: "join",
            code,
            displayName,
            clientId: clientIdFor(code),
          }),
        );
        // Flush anything queued while we were reconnecting (votes are idempotent server-side, so
        // re-sending is safe).
        const queued = outboxRef.current;
        outboxRef.current = [];
        for (const m of queued) ws.send(JSON.stringify(m));
      };
      ws.onmessage = handleMessage;
      ws.onclose = () => {
        if (disposed) return;
        // Auto-reconnect with capped exponential backoff; the DO restores our
        // identity + votes from the stable clientId on rejoin.
        if (attempts >= MAX_ATTEMPTS) return setStatus("closed");
        attempts += 1;
        setStatus("connecting");
        const delay = Math.min(1000 * 2 ** (attempts - 1), 5000);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    /*
     * Come back when the phone does.
     *
     * Six attempts on a five-second cap is about twenty-two seconds, and then this used to give up for
     * good - which is a pocket, a lift, or most of what a restaurant's wifi does to a phone.
     *
     * Both signals, because neither is enough alone: `online` never fires if the network was not
     * technically lost, and a backgrounded tab is often throttled out of its own retries. Attempts reset,
     * because this is a new chance rather than a seventh go at the old one.
     */
    const retryNow = () => {
      if (disposed) return;
      if (document.hidden) return;
      const open = wsRef.current?.readyState;
      if (open === WebSocket.OPEN || open === WebSocket.CONNECTING) return;
      clearTimeout(reconnectTimer);
      attempts = 0;
      setStatus("connecting");
      connect();
    };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", retryNow);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
      wsRef.current?.close();
    };
  }, [code, displayName]);

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      // Not open (reconnecting): queue and flush on reopen instead of throwing/dropping.
      outboxRef.current.push(message);
    }
  }, []);

  return {
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
  };
}
