import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  Restaurant,
  ServerMessage,
  Session,
  VisitedPlace,
} from "@wherever/shared";

type Status = "connecting" | "open" | "closed";

export interface Progress {
  finishedCount: number;
  totalParticipants: number;
}

export type MatchState =
  | { kind: "match"; restaurant: Restaurant; rightSwipes: number; totalParticipants: number }
  | { kind: "none" }
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
  const [alreadyVoted, setAlreadyVoted] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [match, setMatch] = useState<MatchState>(null);
  const [visited, setVisited] = useState<VisitedPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [everConnected, setEverConnected] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

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
          setProgress(null);
          setDeck(msg.restaurants);
          return setAlreadyVoted(msg.alreadyVoted ?? []);
        case "vote_progress":
          return setProgress({
            finishedCount: msg.finishedCount,
            totalParticipants: msg.totalParticipants,
          });
        case "match":
          return setMatch({
            kind: "match",
            restaurant: msg.restaurant,
            rightSwipes: msg.rightSwipes,
            totalParticipants: msg.totalParticipants,
          });
        case "no_match":
          return setMatch({ kind: "none" });
        case "history":
          return setVisited(msg.visited);
        case "reaction": {
          const id = crypto.randomUUID();
          setReactions((prev) => [...prev, { id, emoji: msg.emoji, from: msg.from }]);
          // Drop it after the float animation so the list can't grow unbounded.
          setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 2600);
          return;
        }
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
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { session, deck, alreadyVoted, progress, match, visited, error, status, everConnected, reactions, send };
}
