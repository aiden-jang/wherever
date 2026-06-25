import { DurableObject } from "cloudflare:workers";
import {
  clientMessageSchema,
  type Participant,
  type Restaurant,
  type ServerMessage,
  type Session,
  type SessionFilters,
  type SessionStatus,
  type VoteMode,
} from "@wherever/shared";
import { createRestaurantSource } from "./restaurantSource.js";
import type { Env } from "./env.js";

/** What we attach to each WebSocket so presence survives DO hibernation. */
interface SocketAttachment {
  participantId: string;
  displayName: string;
  isHost: boolean;
}

/** Session metadata, persisted in DO storage (seeded by the Worker via RPC). */
interface SessionMeta {
  code: string;
  status: SessionStatus;
  voteMode: VoteMode;
  filters: SessionFilters;
}

/**
 * One instance per session, addressed by session code. It owns every WebSocket
 * for the session and (from Phase 3) holds the live vote tally.
 *
 * Single-threaded, so counting a vote and deciding a winner cannot interleave.
 * See docs/adr/0001-durable-objects.md.
 */
export class SessionRoom extends DurableObject<Env> {
  /** RPC: the Worker calls this right after creating the session row. */
  async initialize(meta: SessionMeta): Promise<void> {
    const existing = await this.ctx.storage.get<SessionMeta>("meta");
    if (!existing) await this.ctx.storage.put("meta", meta);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    // Hibernatable: the runtime can evict this object between frames.
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

    const msg = result.data;
    switch (msg.type) {
      case "join":
        return this.handleJoin(ws, msg.displayName);
      case "start_round":
        return this.handleStartRound(ws);
      case "swipe":
      case "decide_now":
        // Accepted but not yet tallied; voting + match land in Phase 3.
        return;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    // The socket is on its way out; rebuild presence for everyone else.
    await this.broadcastState(ws);
  }

  private async handleJoin(ws: WebSocket, displayName: string): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) {
      return this.send(ws, {
        type: "error",
        message: "That session does not exist.",
      });
    }

    // First participant to join becomes the host.
    let hostId = await this.ctx.storage.get<string>("hostId");
    const participantId = crypto.randomUUID();
    let isHost = false;
    if (!hostId) {
      hostId = participantId;
      isHost = true;
      await this.ctx.storage.put("hostId", hostId);
    }

    const attachment: SocketAttachment = { participantId, displayName, isHost };
    ws.serializeAttachment(attachment);

    await this.broadcastState();

    // Late joiner during a live round gets the same deck everyone else has.
    if (meta.status === "swiping") {
      const deck = await this.getOrCreateDeck(meta);
      this.send(ws, { type: "deck", restaurants: deck });
    }
  }

  private async handleStartRound(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, {
        type: "error",
        message: "Only the host can start the round.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;
    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);

    // Fetch the deck once and store it so every participant votes the same set.
    const deck = await this.getOrCreateDeck(meta);
    this.broadcast({ type: "deck", restaurants: deck });
    await this.broadcastState();
  }

  /** Deck is fetched once per session and reused for late joiners / reconnects. */
  private async getOrCreateDeck(meta: SessionMeta): Promise<Restaurant[]> {
    let deck = await this.ctx.storage.get<Restaurant[]>("deck");
    if (!deck) {
      const source = createRestaurantSource(this.env.RESTAURANT_SOURCE ?? "mock");
      deck = await source.fetchDeck(meta.filters);
      await this.ctx.storage.put("deck", deck);
    }
    return deck;
  }

  /** Rebuild the participant list from live sockets and push it to everyone. */
  private async broadcastState(closing?: WebSocket): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;

    const sockets = this.ctx.getWebSockets();
    const participants: Participant[] = [];
    for (const s of sockets) {
      if (s === closing) continue;
      const att = s.deserializeAttachment() as SocketAttachment | null;
      if (!att) continue; // connected but has not joined yet
      participants.push({
        id: att.participantId,
        displayName: att.displayName,
        isHost: att.isHost,
        connected: true,
      });
    }

    const session: Session = {
      id: meta.code,
      code: meta.code,
      status: meta.status,
      voteMode: meta.voteMode,
      filters: meta.filters,
      participants,
    };

    const payload = JSON.stringify({
      type: "session_state",
      session,
    } satisfies ServerMessage);

    for (const s of sockets) {
      if (s === closing) continue;
      try {
        s.send(payload);
      } catch {
        // socket is gone; the next broadcast will omit it.
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  /** Send one message to every connected socket. */
  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const s of this.ctx.getWebSockets()) {
      try {
        s.send(payload);
      } catch {
        // gone; next broadcast omits it.
      }
    }
  }
}
