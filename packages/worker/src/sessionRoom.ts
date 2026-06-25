import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  clientMessageSchema,
  countFinished,
  decideWinner,
  type DecisionResult,
  type Participant,
  type Restaurant,
  type ServerMessage,
  type Session,
  type SessionFilters,
  type SessionStatus,
  type SwipeDirection,
  type VisitedPlace,
  type Vote,
  type VoteMode,
} from "@wherever/shared";
import { createRestaurantSource } from "./restaurantSource.js";
import { visitedPlaces } from "./db/schema.js";
import type { Env } from "./env.js";

/** Attached to each WebSocket so presence survives DO hibernation. */
interface SocketAttachment {
  participantId: string;
  displayName: string;
  isHost: boolean;
}

interface SessionMeta {
  code: string;
  status: SessionStatus;
  voteMode: VoteMode;
  filters: SessionFilters;
}

/** clientId -> stable identity, so a reconnecting client keeps its votes. */
type ClientMap = Record<string, { participantId: string; isHost: boolean }>;
/** Votes keyed by `${participantId}:${restaurantId}` for idempotency. */
type VoteMap = Record<string, Vote>;

/**
 * One instance per session, addressed by session code. Owns every WebSocket for
 * the session and holds the live vote state.
 *
 * Single-threaded, so counting a vote and deciding a winner cannot interleave:
 * the status check-and-flip in `decide` makes the result fire exactly once with
 * no locks. See docs/adr/0001-durable-objects.md.
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
        return this.handleJoin(ws, msg.displayName, msg.clientId);
      case "start_round":
        return this.handleStartRound(ws);
      case "swipe":
        return this.handleSwipe(ws, msg.restaurantId, msg.direction);
      case "decide_now":
        return this.handleDecideNow(ws);
      case "again":
        return this.handleAgain(ws);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.broadcastState(ws);
  }

  // ---- handlers ----

  private async handleJoin(
    ws: WebSocket,
    displayName: string,
    clientId?: string,
  ): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) {
      return this.send(ws, {
        type: "error",
        message: "That session does not exist.",
      });
    }

    const identity = await this.resolveIdentity(clientId);
    ws.serializeAttachment({ ...identity, displayName });

    await this.broadcastState();
    this.send(ws, { type: "history", visited: await this.getVisited(meta.code) });

    if (meta.status === "swiping") {
      const deck = await this.getOrCreateDeck(meta);
      const votes = await this.getVotes();
      const alreadyVoted = votes
        .filter((v) => v.participantId === identity.participantId)
        .map((v) => v.restaurantId);
      this.send(ws, { type: "deck", restaurants: deck, alreadyVoted });
      await this.evaluate(meta); // refresh progress for the new arrival
    } else if (meta.status === "decided") {
      await this.sendResult(ws);
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
    if (!meta || meta.status !== "lobby") return;

    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);

    const deck = await this.getOrCreateDeck(meta);
    this.broadcast({ type: "deck", restaurants: deck });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  private async handleSwipe(
    ws: WebSocket,
    restaurantId: string,
    direction: SwipeDirection,
  ): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;

    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    // Keyed by participant+restaurant: a re-vote overwrites, never double-counts.
    votes[`${att.participantId}:${restaurantId}`] = {
      participantId: att.participantId,
      restaurantId,
      direction,
    };
    await this.ctx.storage.put("votes", votes);

    await this.evaluate(meta);
  }

  private async handleDecideNow(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, {
        type: "error",
        message: "Only the host can call it.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;
    await this.decide(meta);
  }

  // ---- core round logic ----

  /** Recompute + broadcast progress, then decide if everyone connected is done. */
  private async evaluate(meta: SessionMeta): Promise<void> {
    const deck = await this.getOrCreateDeck(meta);
    const votes = await this.getVotes();
    const participants = this.connectedParticipants();
    const total = participants.length;
    const finished = countFinished(
      votes,
      participants.map((p) => p.participantId),
      deck.length,
    );

    this.broadcast({
      type: "vote_progress",
      finishedCount: finished,
      totalParticipants: total,
    });

    if (total > 0 && finished >= total) {
      await this.decide(meta);
    }
  }

  /** Flip to decided exactly once and broadcast the outcome. */
  private async decide(meta: SessionMeta): Promise<void> {
    if (meta.status !== "swiping") return; // already decided; do nothing
    meta.status = "decided";
    await this.ctx.storage.put("meta", meta);

    const deck = await this.getOrCreateDeck(meta);
    const votes = await this.getVotes();
    const result = decideWinner(deck, votes);
    await this.ctx.storage.put("winner", result);

    // The chosen place joins the group's history so it drops out of next time.
    if (result) {
      await this.recordVisit(meta.code, result.restaurant.id, result.restaurant.name);
    }

    this.broadcastResult(result, this.connectedParticipants().length);
    await this.broadcastHistory(meta.code);
    await this.broadcastState();
  }

  /** Host starts a fresh round; already-picked places are excluded. */
  private async handleAgain(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, {
        type: "error",
        message: "Only the host can start another round.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;

    await this.ctx.storage.delete("deck");
    await this.ctx.storage.delete("votes");
    await this.ctx.storage.delete("winner");

    const deck = await this.fetchFreshDeck(meta); // excludes visited
    if (deck.length === 0) {
      await this.ctx.storage.delete("deck");
      return this.broadcast({
        type: "error",
        message: "You've been everywhere nearby. Widen the search and try again.",
      });
    }

    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    this.broadcast({ type: "deck", restaurants: deck });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  // ---- helpers ----

  private async resolveIdentity(
    clientId?: string,
  ): Promise<{ participantId: string; isHost: boolean }> {
    const map = (await this.ctx.storage.get<ClientMap>("clientMap")) ?? {};
    if (clientId && map[clientId]) return map[clientId];

    const participantId = crypto.randomUUID();
    const hostId = await this.ctx.storage.get<string>("hostId");
    const isHost = !hostId;
    if (isHost) await this.ctx.storage.put("hostId", participantId);

    const identity = { participantId, isHost };
    if (clientId) {
      map[clientId] = identity;
      await this.ctx.storage.put("clientMap", map);
    }
    return identity;
  }

  private async getVotes(): Promise<Vote[]> {
    const map = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    return Object.values(map);
  }

  private async getOrCreateDeck(meta: SessionMeta): Promise<Restaurant[]> {
    const cached = await this.ctx.storage.get<Restaurant[]>("deck");
    return cached ?? this.fetchFreshDeck(meta);
  }

  /** Fetch from the source, drop anything the group already picked, cache it. */
  private async fetchFreshDeck(meta: SessionMeta): Promise<Restaurant[]> {
    const source = createRestaurantSource(
      this.env.RESTAURANT_SOURCE ?? "mock",
      this.env.FOURSQUARE_API_KEY,
    );
    const all = await source.fetchDeck(meta.filters);
    const visited = await this.getVisited(meta.code);
    const seen = new Set(visited.map((v) => v.restaurantId));
    const deck = all.filter((r) => !seen.has(r.id));
    await this.ctx.storage.put("deck", deck);
    return deck;
  }

  private async getVisited(code: string): Promise<VisitedPlace[]> {
    const db = drizzle(this.env.DB);
    const rows = await db
      .select()
      .from(visitedPlaces)
      .where(eq(visitedPlaces.sessionCode, code));
    return rows.map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      visitedAt: r.visitedAt.toISOString(),
    }));
  }

  private async recordVisit(
    code: string,
    restaurantId: string,
    name: string,
  ): Promise<void> {
    const db = drizzle(this.env.DB);
    await db.insert(visitedPlaces).values({
      id: crypto.randomUUID(),
      sessionCode: code,
      restaurantId,
      name,
    });
  }

  /** Unique connected participants (dedup across reconnect overlap). */
  private connectedParticipants(): SocketAttachment[] {
    const seen = new Map<string, SocketAttachment>();
    for (const s of this.ctx.getWebSockets()) {
      const att = s.deserializeAttachment() as SocketAttachment | null;
      if (att) seen.set(att.participantId, att);
    }
    return [...seen.values()];
  }

  private async sendResult(ws: WebSocket): Promise<void> {
    const result = await this.ctx.storage.get<DecisionResult | null>("winner");
    const total = this.connectedParticipants().length;
    if (result) {
      this.send(ws, {
        type: "match",
        restaurant: result.restaurant,
        rightSwipes: result.rightSwipes,
        totalParticipants: total,
      });
    } else {
      this.send(ws, { type: "no_match" });
    }
  }

  private async broadcastHistory(code: string): Promise<void> {
    this.broadcast({ type: "history", visited: await this.getVisited(code) });
  }

  private broadcastResult(
    result: DecisionResult | null,
    total: number,
  ): void {
    if (result) {
      this.broadcast({
        type: "match",
        restaurant: result.restaurant,
        rightSwipes: result.rightSwipes,
        totalParticipants: total,
      });
    } else {
      this.broadcast({ type: "no_match" });
    }
  }

  private async broadcastState(closing?: WebSocket): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;

    const seen = new Map<string, Participant>();
    for (const s of this.ctx.getWebSockets()) {
      if (s === closing) continue;
      const att = s.deserializeAttachment() as SocketAttachment | null;
      if (!att) continue;
      seen.set(att.participantId, {
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
      participants: [...seen.values()],
    };

    const payload = JSON.stringify({
      type: "session_state",
      session,
    } satisfies ServerMessage);
    for (const s of this.ctx.getWebSockets()) {
      if (s === closing) continue;
      try {
        s.send(payload);
      } catch {
        // gone; next broadcast omits it.
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

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
