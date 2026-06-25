import { DurableObject } from "cloudflare:workers";
import { clientMessageSchema, type ServerMessage } from "@wherever/shared";
import type { Env } from "./env.js";

/**
 * One instance per session, addressed by session code. It owns every WebSocket
 * for the session and (from Phase 3) holds the live vote tally in memory.
 *
 * Because a Durable Object is single-threaded, "count this vote" and "decide
 * the winner exactly once" need no locks: they cannot interleave. That is the
 * whole reason we picked this primitive. See docs/adr/0001-durable-objects.md.
 *
 * WebSockets use the hibernation API (acceptWebSocket) so an idle session does
 * not keep the object resident and billable.
 */
export class SessionRoom extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernatable: the runtime can evict this object between messages and
    // rehydrate it when the next frame arrives.
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof raw !== "string") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.send(ws, { type: "error", message: "Bad message." });
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      return this.send(ws, { type: "error", message: "Unrecognized message." });
    }

    // Phase 1+ wires join / start_round / swipe / decide_now here. Phase 0 just
    // proves the validated round-trip works end to end.
    this.send(ws, {
      type: "error",
      message: `Got "${result.data.type}". Not wired up yet, but I heard you.`,
    });
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "session_room_closing");
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}
