import { NUDGE_COOLDOWN_MS } from "@wherever/shared";
import { RoundController } from "./roundController.js";
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { visitedPlaces } from "./db/schema.js";
import {
  cardsBehind,
  finishedParticipantIds,
  vetoedRestaurantIds,
  type DecisionResult,
  type ServerMessage,
  type SessionFilters,
  type Vibe,
} from "@wherever/shared";
import { clientMessageSchema } from "@wherever/shared/schemas";
import type { Env } from "./env.js";

import { readVotes } from "./roomState.js";
import type { ClientMap, SessionMeta, SocketAttachment, VoteMap } from "./roomState.js";
import {
  beginHostGraceIfNeeded,
  hasLiveSocketFor,
  reassignHostAway,
  rescheduleAlarm,
} from "./hostHandover.js";
import { sendVibes, setVibe } from "./vibeTally.js";
import { attachmentsOn, broadcastTo, resultMessage, sendTo, broadcastSessionState } from "./roomSockets.js";
import { readDemoMode, visitedFor } from "./deckSource.js";

/** One room owns socket identity, presence, and host handover. RoundController enforces voting and verdict transitions using the same storage. */
export class SessionRoom extends DurableObject<Env> {
  private rounds = new RoundController(this.ctx, this.env);

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

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
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
        return this.rounds.handleStartRound(ws);
      case "swipe":
        return this.rounds.handleSwipe(
          ws,
          msg.restaurantId,
          msg.direction,
          msg.super ?? false,
          msg.veto ?? false,
        );
      case "undo_swipe":
        return this.rounds.handleUndoSwipe(ws, msg.restaurantId);
      case "decide_now":
        return this.rounds.handleDecideNow(ws);
      case "again":
        return this.rounds.handleAgain(ws, msg.deck ?? "new");
      case "choose_alternative":
        return this.rounds.handleChooseAlternative(ws, msg.restaurantId);
      case "set_vibe":
        return this.handleSetVibe(ws, msg.vibe);
      case "set_filters":
        return this.handleSetFilters(ws, msg.filters);
      case "set_never_again":
        return this.handleSetNeverAgain(ws, msg.restaurantId, msg.neverAgain);
      case "react":
        return this.handleReact(ws, msg.emoji);
      case "nudge_them":
        return this.handleNudge(ws);
    }
  }

  /**
   * One person's vibe, tallied and fanned out without naming anybody. Lobby only: the vibe decides
   * which deck is fetched, so mid-round it would put two people on different restaurants.
   */
  private async handleSetVibe(ws: WebSocket, vibe: Vibe | null): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;
    await sendVibes(this.ctx, await setVibe(this.ctx.storage, att.participantId, vibe));
  }

  /** Host only, lobby only: one shared set of rules, and changing them mid-round would deal two
   *  people different restaurants. */
  private async handleSetFilters(ws: WebSocket, filters: SessionFilters): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;
    meta.filters = filters;
    await this.ctx.storage.put("meta", meta);
    await this.broadcastState();
  }

  /**
   * Only for a place the group has actually been. This is a note on a visit, not a way to blacklist
   * any id you like - without the check, anybody with the code could quietly shrink the deck.
   */
  private async handleSetNeverAgain(ws: WebSocket, restaurantId: string, neverAgain: boolean): Promise<void> {
    // Joined participants may update the group’s visited history; an unjoined socket may not.
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;
    const db = drizzle(this.env.DB);
    await db
      .update(visitedPlaces)
      .set({ neverAgain })
      .where(and(eq(visitedPlaces.sessionCode, meta.code), eq(visitedPlaces.restaurantId, restaurantId)));
    this.broadcast({ type: "history", visited: await visitedFor(this.env, meta.code) });
  }

  /* Sent only to the sockets it is about, so nobody learns who the slow one is from a broadcast. Rate
     limited on the server, because a button you can hold down is not a rate limit. */
  private async handleNudge(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, { type: "error", message: "Only the host can hurry people along." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;

    const last = (await this.ctx.storage.get<number>("lastNudge")) ?? 0;
    if (Date.now() - last < NUDGE_COOLDOWN_MS) {
      return this.send(ws, { type: "error", message: "Give them a moment. You just did that." });
    }
    await this.ctx.storage.put("lastNudge", Date.now());

    const deck = await this.rounds.deckFor(meta);
    const votes = await readVotes(this.ctx.storage);
    const participants = this.connectedParticipants();
    const finished = new Set(
      finishedParticipantIds(
        votes,
        participants.map((p) => p.participantId),
        deck.length,
      ),
    );
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue; // the host has not finished either, and nudging yourself is daft
      const who = socket.deserializeAttachment() as SocketAttachment | null;
      if (who && !finished.has(who.participantId)) this.send(socket, { type: "nudge" });
    }
  }

  /** Fan an ephemeral emoji reaction out to everyone in the session. */
  private handleReact(ws: WebSocket, emoji: string): void {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    this.broadcast({ type: "reaction", emoji, from: att.displayName, fromId: att.participantId });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await beginHostGraceIfNeeded(this.ctx, this.env, ws);
    await this.broadcastState(ws);
    // A departure drops the participant count — re-check completion (excluding the closing socket,
    // which getWebSockets still returns here) so a finished group decides instead of stalling on
    // the person who just left.
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta?.status === "swiping") await this.rounds.evaluate(meta, ws);
  }

  /** Run whichever deadlines have passed - hand off host, decide the round, or both - then reschedule
   *  anything still pending. */
  override async alarm(): Promise<void> {
    const now = Date.now();
    let hostChanged = false;

    const grace = await this.ctx.storage.get<number>("hostGraceUntil");
    if (grace && now >= grace) {
      await this.ctx.storage.delete("hostGraceUntil");
      const hostId = await this.ctx.storage.get<string>("hostId");
      if (hostId && !hasLiveSocketFor(this.ctx, hostId)) {
        await reassignHostAway(this.ctx, hostId);
        hostChanged = true;
      }
    }

    const roundEnd = await this.ctx.storage.get<number>("roundEndsAt");
    if (roundEnd && now >= roundEnd) {
      await this.ctx.storage.delete("roundEndsAt");
      const meta = await this.ctx.storage.get<SessionMeta>("meta");
      if (meta?.status === "swiping") await this.rounds.decide(meta); // time's up → tally decides
    }

    await rescheduleAlarm(this.ctx);
    if (hostChanged) await this.broadcastState();
  }

  // ---- handlers ----

  private async handleJoin(ws: WebSocket, displayName: string, clientId?: string): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) {
      return this.send(ws, {
        type: "error",
        message: "That session does not exist.",
      });
    }

    const identity = await this.resolveIdentity(clientId);
    ws.serializeAttachment({ ...identity, displayName });

    // If the host is (back) online — this socket may be their reconnect — cancel the host-grace
    // deadline so a refresh never hands off host. Keep any round timer running (rescheduleAlarm).
    const hostId = await this.ctx.storage.get<string>("hostId");
    if (hostId && hasLiveSocketFor(this.ctx, hostId)) {
      await this.ctx.storage.delete("hostGraceUntil");
      await rescheduleAlarm(this.ctx);
    }

    // Tell the client its own participantId so it identifies itself by a stable id, not by display
    // name (two participants can share a name, which otherwise misattaches host controls).
    this.send(ws, { type: "identity", participantId: identity.participantId });

    await this.broadcastState();
    this.send(ws, { type: "history", visited: await visitedFor(this.env, meta.code) });

    // Whoever just walked in needs the tallies and their own pick back, which a reconnect also relies on
    // to re-select the button they had already chosen.
    if (meta.status === "lobby") await sendVibes(this.ctx);

    if (meta.status === "swiping") {
      const deck = await this.rounds.deckFor(meta);
      const votes = await readVotes(this.ctx.storage);
      const mine = votes.filter((v) => v.participantId === identity.participantId);
      const alreadyVoted = mine.map((v) => v.restaurantId);
      const superUsed = mine.some((v) => v.super);
      const vetoUsed = mine.some((v) => v.veto);
      const behindBy = cardsBehind(votes, identity.participantId);
      this.send(ws, {
        type: "deck",
        restaurants: deck,
        alreadyVoted,
        superUsed,
        vetoUsed,
        ...(behindBy > 0 ? { behindBy } : {}),
        demo: await readDemoMode(this.ctx.storage),
        roundEndsAt: (await this.ctx.storage.get<number>("roundEndsAt")) ?? undefined,
      });
      await this.rounds.evaluate(meta); // refresh progress for the new arrival
    } else if (meta.status === "decided") {
      await this.sendResult(ws);
    }
  }

  // ---- helpers ----

  private async resolveIdentity(clientId?: string): Promise<{ participantId: string; isHost: boolean }> {
    const map = (await this.ctx.storage.get<ClientMap>("clientMap")) ?? {};
    if (clientId && map[clientId]) {
      const entry = map[clientId];
      // Returning to a room with no host (the host left and the grace window elapsed) → reclaim it,
      // so a refresh — even a slow one — never leaves the room stranded without a host.
      const currentHostId = await this.ctx.storage.get<string>("hostId");
      if (!currentHostId) {
        const restored = { ...entry, isHost: true };
        map[clientId] = restored;
        await this.ctx.storage.put("hostId", entry.participantId);
        await this.ctx.storage.put("clientMap", map);
        return restored;
      }
      return entry;
    }

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

  /** Unique connected participants (dedup across reconnect overlap). */
  private connectedParticipants(exclude?: WebSocket): SocketAttachment[] {
    return attachmentsOn(this.ctx, exclude);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    sendTo(ws, message);
  }

  private broadcast(message: ServerMessage): void {
    broadcastTo(this.ctx, message);
  }

  /** Everything the verdict needs that lives in storage rather than in the decision itself. */
  private async resultContext(): Promise<{ total: number; vetoedCount: number; round: number }> {
    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    return {
      total: this.connectedParticipants().length,
      vetoedCount: vetoedRestaurantIds(Object.values(votes)).size,
      // againRounds counts the re-deals, so the round that decided it is one more than that.
      round: ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1,
    };
  }

  private async sendResult(ws: WebSocket): Promise<void> {
    const result = (await this.ctx.storage.get<DecisionResult | null>("winner")) ?? null;
    const { total, vetoedCount, round } = await this.resultContext();
    sendTo(ws, resultMessage(result, total, vetoedCount, round));
  }

  private async broadcastState(closing?: WebSocket): Promise<void> {
    await broadcastSessionState(this.ctx, closing);
  }
}
