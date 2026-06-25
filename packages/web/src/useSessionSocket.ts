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
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code || !displayName) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    // In prod the Worker may live on another origin; in dev Vite proxies /ws.
    const wsBase =
      import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;
    const ws = new WebSocket(`${wsBase}/ws/${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      ws.send(
        JSON.stringify({
          type: "join",
          code,
          displayName,
          clientId: clientIdFor(code),
        }),
      );
    };
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (event) => {
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
        case "error":
          return setError(msg.message);
      }
    };

    return () => ws.close();
  }, [code, displayName]);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { session, deck, alreadyVoted, progress, match, visited, error, status, send };
}
