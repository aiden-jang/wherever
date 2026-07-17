import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import {
  clientMessageSchema,
  finishedParticipantIds,
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
import { createRestaurantSource, MockRestaurantSource } from "./restaurantSource.js";
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

// Each "again" round is a paid Places fetch; cap how many a single session can trigger.
const MAX_AGAIN_ROUNDS = 20;

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
      case "react":
        return this.handleReact(ws, msg.emoji);
    }
  }

  /** Fan an ephemeral emoji reaction out to everyone in the session. */
  private handleReact(ws: WebSocket, emoji: string): void {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    this.broadcast({ type: "reaction", emoji, from: att.displayName });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.reassignHostIfNeeded(ws);
    await this.broadcastState(ws);
    // A departure drops the participant count — re-check completion (excluding the closing socket,
    // which getWebSockets still returns here) so a finished group decides instead of stalling on
    // the person who just left.
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta?.status === "swiping") await this.evaluate(meta, ws);
  }

  /**
   * If the host's last socket is closing, hand host to another connected participant so the group
   * isn't stranded in the lobby (only the host can start rounds / decide). host is cached in three
   * places — the `hostId` record, the `clientMap`, and each live socket attachment — so all three
   * are updated, and the new host keeps it across a reconnect. Empty room: clear host so the next
   * person to join becomes it.
   */
  private async reassignHostIfNeeded(closing: WebSocket): Promise<void> {
    const att = closing.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) return;
    const hostId = await this.ctx.storage.get<string>("hostId");
    if (hostId !== att.participantId) return;

    // Still present on another socket (second tab / reconnect race)? Keep them as host.
    const stillHere = this.ctx.getWebSockets().some((s) => {
      if (s === closing) return false;
      const a = s.deserializeAttachment() as SocketAttachment | null;
      return a?.participantId === att.participantId;
    });
    if (stillHere) return;

    // Pick another connected participant, if any.
    let newHostId: string | undefined;
    for (const s of this.ctx.getWebSockets()) {
      if (s === closing) continue;
      const a = s.deserializeAttachment() as SocketAttachment | null;
      if (a && a.participantId !== att.participantId) {
        newHostId = a.participantId;
        break;
      }
    }

    const map = (await this.ctx.storage.get<ClientMap>("clientMap")) ?? {};
    for (const [key, entry] of Object.entries(map)) {
      if (entry.participantId === att.participantId) map[key] = { ...entry, isHost: false };
      else if (newHostId && entry.participantId === newHostId) map[key] = { ...entry, isHost: true };
    }

    if (!newHostId) {
      await this.ctx.storage.delete("hostId");
      await this.ctx.storage.put("clientMap", map);
      return;
    }

    await this.ctx.storage.put("hostId", newHostId);
    await this.ctx.storage.put("clientMap", map);
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as SocketAttachment | null;
      if (a?.participantId === newHostId && !a.isHost) s.serializeAttachment({ ...a, isHost: true });
    }
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

    // Tell the client its own participantId so it identifies itself by a stable id, not by display
    // name (two participants can share a name, which otherwise misattaches host controls).
    this.send(ws, { type: "identity", participantId: identity.participantId });

    await this.broadcastState();
    this.send(ws, { type: "history", visited: await this.getVisited(meta.code) });

    if (meta.status === "swiping") {
      const deck = await this.getOrCreateDeck(meta);
      const votes = await this.getVotes();
      const alreadyVoted = votes
        .filter((v) => v.participantId === identity.participantId)
        .map((v) => v.restaurantId);
      this.send(ws, { type: "deck", restaurants: deck, alreadyVoted, demo: await this.isDemoMode() });
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
        message: "Only the host can start swiping.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;

    // Fetch BEFORE flipping to swiping: if the Places call fails we stay in the lobby and let the
    // host retry, rather than stranding everyone on an empty "swiping" screen. (An empty-but-ok
    // result is distinct — that legitimately shows "nothing survived the filters".)
    let deck: Restaurant[];
    try {
      deck = await this.getOrCreateDeck(meta);
    } catch {
      return this.send(ws, {
        type: "error",
        message: "couldn't load restaurants right now. give it a moment and try again.",
      });
    }

    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    this.broadcast({ type: "deck", restaurants: deck, demo: await this.isDemoMode() });
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
  private async evaluate(meta: SessionMeta, excludeWs?: WebSocket): Promise<void> {
    const deck = await this.getOrCreateDeck(meta);
    const votes = await this.getVotes();
    const participants = this.connectedParticipants(excludeWs);
    const total = participants.length;
    const finishedIds = finishedParticipantIds(
      votes,
      participants.map((p) => p.participantId),
      deck.length,
    );

    this.broadcast({
      type: "vote_progress",
      finishedCount: finishedIds.length,
      totalParticipants: total,
      // Only reveal identities when the host chose to; otherwise the field is omitted and the round
      // stays anonymous on the wire, not just in the UI.
      ...(meta.filters.revealVoters ? { finishedIds } : {}),
    });

    if (total > 0 && finishedIds.length >= total) {
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
        message: "Only the host can run it back.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;

    // Hard server-side cap on "again" rounds: each one is a paid Places fetch, so bound how many
    // times a single session can re-deal before it has to start fresh. (The Google daily quota is
    // the outer hard limit; this stops one session from hammering it.)
    const rounds = (await this.ctx.storage.get<number>("againRounds")) ?? 0;
    if (rounds >= MAX_AGAIN_ROUNDS) {
      return this.send(ws, {
        type: "error",
        message: "you've been through a lot of rounds. start a fresh session to keep going.",
      });
    }

    // Fetch the fresh deck BEFORE tearing down the current result. If the area is picked clean we
    // must leave the existing winner/deck/status intact, otherwise a late joiner would arrive to a
    // null winner and be told "nobody liked anything" even though a match was reached.
    let deck: Restaurant[];
    try {
      deck = await this.fetchFreshDeck(meta); // excludes visited; caches into "deck"
    } catch {
      return this.send(ws, {
        type: "error",
        message: "couldn't load more spots right now. give it a moment and try again.",
      });
    }
    if (deck.length === 0) {
      return this.send(ws, {
        type: "error",
        message:
          "That's everywhere nearby, picked clean. Start a fresh session with a wider radius to keep eating.",
      });
    }

    await this.ctx.storage.delete("votes");
    await this.ctx.storage.delete("winner");
    await this.ctx.storage.put("againRounds", rounds + 1);
    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    this.broadcast({ type: "deck", restaurants: deck, demo: await this.isDemoMode() });
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
    const kind = this.env.RESTAURANT_SOURCE ?? "mock";
    const apiKey = kind === "google" ? this.env.GOOGLE_PLACES_API_KEY : this.env.FOURSQUARE_API_KEY;

    // A real Google search is about to happen → charge it against the monthly budget first. If the
    // budget is spent, don't call Google: fall back to the sample deck so the app stays playable as
    // a demo, and flag it so the client can explain why the data is stand-in.
    let source;
    let demo = false;
    if (kind === "google" && apiKey) {
      const meter = this.env.USAGE_METER.get(this.env.USAGE_METER.idFromName("global"));
      if (await meter.tryConsume("search")) {
        source = createRestaurantSource(kind, apiKey, this.env.PUBLIC_API_BASE);
      } else {
        source = new MockRestaurantSource();
        demo = true;
      }
    } else {
      source = createRestaurantSource(kind, apiKey, this.env.PUBLIC_API_BASE);
    }

    const all = await source.fetchDeck(meta.filters);
    const visited = await this.getVisited(meta.code);
    const seen = new Set(visited.map((v) => v.restaurantId));
    const deck = all.filter((r) => !seen.has(r.id));
    await this.ctx.storage.put("deck", deck);
    await this.ctx.storage.put("demoMode", demo);
    return deck;
  }

  /** Whether the current deck is the sample fallback served because the live-data budget is spent. */
  private async isDemoMode(): Promise<boolean> {
    return (await this.ctx.storage.get<boolean>("demoMode")) ?? false;
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
  private connectedParticipants(exclude?: WebSocket): SocketAttachment[] {
    const seen = new Map<string, SocketAttachment>();
    for (const s of this.ctx.getWebSockets()) {
      // During webSocketClose the closing socket is still returned here, so callers can exclude it.
      if (s === exclude) continue;
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
