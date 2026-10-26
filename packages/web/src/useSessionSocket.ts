import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@wherever/shared";
import { initialSessionState, sessionReducer } from "./sessionState.js";
import { withViewTransition } from "./viewTransition.js";

/** Preserve identity across reconnects. Blocked storage falls back to memory so joining still works. */
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

export function useSessionSocket(code: string, displayName: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const wsRef = useRef<WebSocket | null>(null);
  // Messages sent while the socket is mid-reconnect are buffered here and flushed on reopen, so a
  // vote cast during a blip isn't silently dropped (which would stall the round for everyone).
  const outboxRef = useRef<ClientMessage[]>([]);

  useLayoutEffect(() => {
    dispatch({ type: "reset" });
    outboxRef.current = [];
  }, [code, displayName]);

  useEffect(() => {
    if (!code || !displayName) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Same origin in production; Vite proxies /ws to the local Worker.
    const wsBase = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;

    let disposed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_ATTEMPTS = 6;

    const reactionTimers = new Set<ReturnType<typeof setTimeout>>();
    const handleMessage = (event: MessageEvent) => {
      if (disposed) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
      const reactionId = msg.type === "reaction" ? crypto.randomUUID() : undefined;
      const update = () => {
        if (!disposed) dispatch({ type: "received", message: msg, reactionId });
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

      ws.onopen = () => {
        if (disposed || ws !== wsRef.current) return;
        attempts = 0;
        dispatch({ type: "connection", status: "open" });
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
      ws.onmessage = (event) => {
        if (ws === wsRef.current) handleMessage(event);
      };
      ws.onclose = () => {
        if (disposed || ws !== wsRef.current) return;
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
      if (disposed) return;
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
      for (const timer of reactionTimers) clearTimeout(timer);
      window.removeEventListener("online", retryNow);
      document.removeEventListener("visibilitychange", retryNow);
      wsRef.current?.close();
      wsRef.current = null;
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

  return { ...state, send };
}
