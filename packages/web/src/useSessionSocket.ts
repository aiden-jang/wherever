import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, Session } from "@wherever/shared";

type Status = "connecting" | "open" | "closed";

/**
 * Owns the WebSocket to a session's Durable Object: connects, sends `join`,
 * and surfaces the latest server-pushed session state. Reconnection with
 * resume lands in Phase 3; for the lobby a clean connect is enough.
 */
export function useSessionSocket(code: string, displayName: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code || !displayName) return;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      ws.send(JSON.stringify({ type: "join", code, displayName }));
    };
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (msg.type === "session_state") setSession(msg.session);
      else if (msg.type === "error") setError(msg.message);
    };

    return () => ws.close();
  }, [code, displayName]);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  return { session, error, status, send };
}
