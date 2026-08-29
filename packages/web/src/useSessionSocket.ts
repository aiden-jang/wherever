import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  ArrivalUpdate,
  DecisionAlternative,
  PlannedMeetup,
  Restaurant,
  ServerMessage,
  Vibe,
  Session,
  TastePulse,
  VisitedPlace,
} from "@wherever/shared";

type Status = "connecting" | "open" | "closed";

export interface Progress {
  finishedCount: number;
  totalParticipants: number;
  /** Ids of participants who've finished; present only in reveal-voters sessions. */
  finishedIds?: string[];
  tastePulse?: TastePulse;
}

export type MatchState =
  | { kind: "match"; restaurant: Restaurant; rightSwipes: number; alternatives: DecisionAlternative[]; totalParticipants: number; vetoedCount: number; tiedWith: number; round: number }
  | { kind: "none"; vetoedCount: number }
  | null;

/** A reaction floating on screen; auto-removed after its animation. */
export interface FloatingReaction {
  id: string;
  emoji: string;
  from: string;
}

/** A stable id per session code so a reconnect keeps the same identity + votes. */
function clientIdFor(code: string): string {
  const key = `cid:${code}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

/**
 * Owns the WebSocket to a session's Durable Object: connects, sends `join` with
 * a stable clientId, and surfaces server-pushed state (session, deck, progress,
 * match).
 */
export function useSessionSocket(code: string, displayName: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [deck, setDeck] = useState<Restaurant[] | null>(null);
  // True when the deck is the sample fallback served because the monthly live-data budget is spent.
  const [demo, setDemo] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState<string[]>([]);
  // Whether this client already spent its super-like this round (seeded from the deck on reconnect).
  const [superUsed, setSuperUsed] = useState(false);
  const [vibeEffect, setVibeEffect] = useState<string | null>(null);
  const [behindBy, setBehindBy] = useState(0);
  const [vetoUsed, setVetoUsed] = useState(false);
  // Absolute epoch-ms deadline when the round auto-decides (null = no timer this round).
  const [roundEndsAt, setRoundEndsAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [match, setMatch] = useState<MatchState>(null);
  const [planned, setPlanned] = useState<PlannedMeetup | null>(null);
  const [arrivals, setArrivals] = useState<ArrivalUpdate[]>([]);
  // Tallies for the group and this client's own pick. The server never sends anybody else's.
  const [vibeCounts, setVibeCounts] = useState<Partial<Record<Vibe, number>>>({});
  const [myVibe, setMyVibe] = useState<Vibe | null>(null);
  const [visited, setVisited] = useState<VisitedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    const wsBase =
      import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;

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
          setPlanned(null);
          setArrivals([]);
          setProgress(null);
          setDeck(msg.restaurants);
          setDemo(msg.demo ?? false);
          setVibeEffect(msg.vibeEffect ?? null);
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
          });
        case "match":
          return setMatch({
            kind: "match",
            restaurant: msg.restaurant,
            rightSwipes: msg.rightSwipes,
            alternatives: msg.alternatives ?? [],
            totalParticipants: msg.totalParticipants,
            vetoedCount: msg.vetoedCount ?? 0,
            tiedWith: msg.tiedWith ?? 0,
            round: msg.round ?? 1,
          });
        case "no_match":
          return setMatch({ kind: "none", vetoedCount: msg.vetoedCount ?? 0 });
        case "history":
          return setVisited(msg.visited);
        case "plan":
          return setPlanned(msg.planned);
        case "arrivals":
          return setArrivals(msg.arrivals);
        case "vibes":
          setVibeCounts(msg.counts);
          return setMyVibe(msg.yours);
        case "reaction": {
          const id = crypto.randomUUID();
          setReactions((prev) => [...prev, { id, emoji: msg.emoji, from: msg.from }]);
          // Drop it after the float animation so the list can't grow unbounded.
          setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2600);
          return;
        }
        case "identity":
          return setParticipantId(msg.participantId);
        case "error":
          return setError(msg.message);
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

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
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

  return { session, deck, demo, vibeEffect, behindBy, superUsed, vetoUsed, roundEndsAt, alreadyVoted, progress, match, planned, arrivals, vibeCounts, myVibe, visited, error, status, everConnected, participantId, reactions, send };
}
