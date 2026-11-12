import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@wherever/shared";
import { initialSessionState, sessionReducer } from "./sessionState.js";
import { clientIdFor } from "./clientIdentity.js";
import { withViewTransition } from "./viewTransition.js";

export function useSessionSocket(code: string, displayName: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRound = useRef<number | null>(null);
  const deadline = useRef<number | undefined>(undefined);
  const joined = useRef(false);
  const terminalRef = useRef(false);

  useLayoutEffect(() => {
    dispatch({ type: "reset" });
    activeRound.current = null;
    joined.current = false;
    terminalRef.current = false;
  }, [code, displayName]);

  useEffect(() => {
    if (!code || !displayName) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Same origin in production; Vite proxies /ws to the local Worker.
    const wsBase = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;

    let disposed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let joinTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_ATTEMPTS = 6;

    const reactionTimers = new Set<ReturnType<typeof setTimeout>>();
    let phaseFrame = 0;
    let latestRound = 0;
    const handleMessage = (event: MessageEvent, socket: WebSocket) => {
      if (disposed) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
      const receivedRound =
        msg.type === "deck"
          ? (msg.roundId ?? 1)
          : msg.type === "match" || msg.type === "no_match"
            ? msg.round
            : undefined;
      if (receivedRound !== undefined && receivedRound < latestRound) return;
      if (receivedRound !== undefined) latestRound = receivedRound;
      if (
        !joined.current &&
        ((msg.type === "session_state" && msg.session.status !== "swiping") ||
          msg.type === "deck" ||
          msg.type === "match" ||
          msg.type === "no_match")
      ) {
        clearTimeout(joinTimer);
        attempts = 0;
        joined.current = true;
        dispatch({ type: "connection", status: "open" });
      }
      if (msg.type === "deck") {
        activeRound.current = msg.roundId ?? 1;
        deadline.current = msg.roundEndsAt;
      }
      if (msg.type === "round_clock") deadline.current = undefined;
      if (msg.type === "session_state" && msg.session.status !== "swiping") activeRound.current = null;
      if (msg.type === "match" || msg.type === "no_match") activeRound.current = null;
      if (msg.type === "reaction" && reactionTimers.size >= 24) return;
      const reactionId = msg.type === "reaction" ? crypto.randomUUID() : undefined;
      if (msg.type === "deck" || msg.type === "match" || msg.type === "no_match") phaseFrame += 1;
      const frame = phaseFrame;
      const update = () => {
        if (!disposed && socket === wsRef.current && (msg.type !== "match" || frame === phaseFrame)) {
          dispatch({ type: "received", message: msg, reactionId });
        }
      };
      if (msg.type === "match") withViewTransition(update);
      else update();
      if (reactionId) {
        const timer = setTimeout(() => {
          reactionTimers.delete(timer);
          if (!disposed) dispatch({ type: "expire_reaction", id: reactionId });
        }, 4500);
        reactionTimers.add(timer);
      }
    };

    const connect = () => {
      const ws = new WebSocket(`${wsBase}/ws/${code}`);
      wsRef.current = ws;
      joinTimer = setTimeout(() => ws.close(), 8000);

      ws.onopen = () => {
        if (disposed || ws !== wsRef.current) return;
        try {
          ws.send(
            JSON.stringify({
              type: "join",
              code,
              displayName,
              clientId: clientIdFor(code),
              lazyPlaces: true,
            }),
          );
        } catch {
          ws.close();
        }
      };
      ws.onmessage = (event) => {
        if (ws === wsRef.current) handleMessage(event, ws);
      };
      ws.onclose = (event) => {
        if (disposed || ws !== wsRef.current) return;
        clearTimeout(joinTimer);
        joined.current = false;
        activeRound.current = null;
        if (event.code === 1008) {
          terminalRef.current = true;
          dispatch({ type: "reset" });
          dispatch({
            type: "received",
            message: { type: "error", message: event.reason || "This room has expired. Create a new room." },
          });
          dispatch({ type: "connection", status: "closed" });
          return;
        }
        // Auto-reconnect with capped exponential backoff; the DO restores our
        // identity + votes from the stable clientId on rejoin.
        if (attempts >= MAX_ATTEMPTS) return dispatch({ type: "connection", status: "closed" });
        attempts += 1;
        dispatch({ type: "connection", status: "connecting" });
        const delay = Math.min(1000 * 2 ** (attempts - 1), 5000);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    // Visibility and network recovery each restart retries; neither signal is sufficient alone.
    const retryNow = () => {
      if (disposed || terminalRef.current) return;
      if (document.hidden) return;
      const open = wsRef.current?.readyState;
      if (open === WebSocket.OPEN || open === WebSocket.CONNECTING) return;
      clearTimeout(reconnectTimer);
      attempts = 0;
      dispatch({ type: "connection", status: "connecting" });
      connect();
    };
    window.addEventListener("online", retryNow);
    document.addEventListener("visibilitychange", retryNow);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(joinTimer);
      for (const timer of reactionTimers) clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [code, displayName]);

  const send = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (!joined.current || !ws || ws.readyState !== WebSocket.OPEN) return false;
    const isVote = message.type === "swipe" || message.type === "undo_swipe";
    if (
      isVote &&
      (activeRound.current === null || (deadline.current !== undefined && Date.now() >= deadline.current))
    )
      return false;
    try {
      ws.send(JSON.stringify(isVote ? { ...message, roundId: activeRound.current } : message));
      return true;
    } catch {
      ws.close();
      return false;
    }
  }, []);

  return { ...state, send };
}
