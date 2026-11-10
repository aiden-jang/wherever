import { NUDGE_COOLDOWN_MS } from "@wherever/shared";
import { RoundController } from "./roundController.js";
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { visitedPlaces } from "./db/schema.js";
import {
  ExpiredRoomError,
  EXPIRED_ROOM_REASON,
  SESSION_TTL_MS,
  expireRoom,
  legacyRoomDeadline,
  putLive,
} from "./sessionRetention.js";
import {
  finishedParticipantIds,
  vetoedRestaurantIds,
  type DecisionResult,
  type SessionFilters,
  type Vibe,
} from "@wherever/shared";
import { clientMessageSchema, hostCredentialSchema } from "@wherever/shared/schemas";
import type { Env } from "./env.js";

import {
  isRoomHost,
  readRoundNumber,
  readVotes,
  roomForJoin,
  socketIdentity,
  turnOffTimer,
} from "./roomState.js";
import type { SessionMeta, VoteMap } from "./roomState.js";
import {
  allowReturn,
  updateReturnGrace,
  beginHostGraceIfNeeded,
  hasLiveSocketFor,
  reassignHostAway,
  rescheduleAlarm,
} from "./hostHandover.js";
import { scrubLegacyPlaces } from "./roomPlaces.js";
import { resolveIdentity } from "./roomIdentity.js";
import { sendVibes, setVibe } from "./vibeTally.js";
import { attachmentsOn, broadcastTo, resultMessage, sendTo, broadcastSessionState } from "./roomSockets.js";
import { presentHistory, readDeck, readDemoMode } from "./deckSource.js";
import { sendResumedDeck, sendRoundPlace } from "./roundResume.js";

/** One room owns socket identity, presence, and host handover. RoundController enforces voting and verdict transitions using the same storage. */
export class SessionRoom extends DurableObject<Env> {
  private lastReaction = new WeakMap<WebSocket, number>();
  private rounds = new RoundController(this.ctx, this.env);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => scrubLegacyPlaces(ctx.storage, env));
  }

  /** RPC: the Worker calls this right after creating the session row. */
  async initialize(meta: SessionMeta, createdAt: number, creatorClientId: string): Promise<boolean> {
    if (!hostCredentialSchema.safeParse(creatorClientId).success) return false;
    const existing = await this.ctx.storage.get<SessionMeta>("meta");
    if (existing) return false;
    if (await this.ctx.storage.get<boolean>("expired")) return false;
    const hostId = crypto.randomUUID();
    await this.ctx.storage.put({
      meta,
      expiresAt: createdAt + SESSION_TTL_MS,
      hostId,
      clientMap: { [creatorClientId]: { participantId: hostId, isHost: true } },
    });
    await rescheduleAlarm(this.ctx);
    return true;
  }

  private async expired(): Promise<boolean> {
    if (await this.ctx.storage.get<boolean>("expired")) return true;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return false;
    let deadline = await this.ctx.storage.get<number>("expiresAt");
    if (deadline === undefined) {
      deadline = await legacyRoomDeadline(this.env, meta.code);
      await this.ctx.storage.put("expiresAt", deadline);
      await rescheduleAlarm(this.ctx);
    }
    if (deadline > Date.now()) return false;
    await this.expire();
    return true;
  }

  /** RPC used by expiry alarms and the legacy-room sweep. */
  async expire(indexedCode?: string): Promise<void> {
    await expireRoom(this.ctx, this.env, indexedCode);
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const isExpired = await this.expired();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    if (isExpired) server.close(1008, EXPIRED_ROOM_REASON);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.live(() => this.receive(ws, raw));
  }

  private async live(run: () => Promise<void>): Promise<void> {
    if (await this.expired()) return;
    try {
      await run();
    } catch (error) {
      if (!(error instanceof ExpiredRoomError)) throw error;
      await this.expire();
    }
  }

  private async receive(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > 8192) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return sendTo(ws, { type: "error", message: "Bad message." });
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      return sendTo(ws, { type: "error", message: "Unrecognized message." });
    }

    const msg = result.data;
    if (msg.type !== "join" && !socketIdentity(ws)) return;
    switch (msg.type) {
      case "join":
        return this.handleJoin(ws, msg.displayName, msg.clientId, msg.lazyPlaces ?? false);
      case "edit_search":
        return this.rounds.editSearch(ws);
      case "start_round":
        return this.rounds.handleStartRound(ws);
      case "swipe":
        return this.rounds.handleSwipe(
          ws,
          msg.restaurantId,
          msg.direction,
          msg.super ?? false,
          msg.veto ?? false,
          msg.roundId,
          msg.choiceId,
        );
      case "undo_swipe":
        return this.rounds.handleUndoSwipe(ws, msg.restaurantId, msg.roundId, msg.choiceId);
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
      case "turn_off_timer":
        return turnOffTimer(this.ctx, msg.roundId);
      case "load_round_place":
        return sendRoundPlace(this.ctx.storage, this.rounds.places, ws, msg.roundId, msg.restaurantId);
    }
  }

  private async handleSetVibe(ws: WebSocket, vibe: Vibe | null): Promise<void> {
    const att = socketIdentity(ws);
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;
    if (this.rounds.transitioning) {
      return sendTo(ws, { type: "error", message: "The deal is already in progress." });
    }
    await sendVibes(this.ctx, await setVibe(this.ctx.storage, att.participantId, vibe));
  }

  private async handleSetFilters(ws: WebSocket, filters: SessionFilters): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;
    if (this.rounds.transitioning) {
      return sendTo(ws, { type: "error", message: "The deal is already in progress." });
    }
    meta.filters = filters;
    await putLive(this.ctx.storage, { meta });
    await broadcastSessionState(this.ctx);
  }

  private async handleSetNeverAgain(ws: WebSocket, restaurantId: string, neverAgain: boolean): Promise<void> {
    // Joined participants may update the group’s visited history; an unjoined socket may not.
    const att = socketIdentity(ws);
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;
    const db = drizzle(this.env.DB);
    await db
      .update(visitedPlaces)
      .set({ neverAgain })
      .where(and(eq(visitedPlaces.sessionCode, meta.code), eq(visitedPlaces.restaurantId, restaurantId)));
    broadcastTo(this.ctx, {
      type: "history",
      visited: await presentHistory(this.env, meta.code, this.rounds.places),
    });
  }

  /* Sent only to the sockets it is about, so nobody learns who the slow one is from a broadcast. Rate
     limited on the server, because a button you can hold down is not a rate limit. */
  private async handleNudge(ws: WebSocket): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) {
      return sendTo(ws, { type: "error", message: "Only the host can hurry people along." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;

    const last = (await this.ctx.storage.get<number>("lastNudge")) ?? 0;
    if (Date.now() - last < NUDGE_COOLDOWN_MS) {
      return sendTo(ws, { type: "error", message: "Give them a moment. You just did that." });
    }
    await putLive(this.ctx.storage, { lastNudge: Date.now() });

    const deck = await readDeck(this.ctx.storage);
    const votes = await readVotes(this.ctx.storage);
    const participants = attachmentsOn(this.ctx);
    const finished = new Set(
      finishedParticipantIds(
        votes,
        participants.map((p) => p.participantId),
        deck.length,
      ),
    );
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue; // the host has not finished either, and nudging yourself is daft
      const who = socketIdentity(socket);
      if (who && !finished.has(who.participantId)) sendTo(socket, { type: "nudge" });
    }
  }

  /** Fan an ephemeral emoji reaction out to everyone in the session. */
  private handleReact(ws: WebSocket, emoji: string): void {
    const att = socketIdentity(ws);
    if (!att) return;
    const now = Date.now();
    if (now - (this.lastReaction.get(ws) ?? 0) < 300) return;
    this.lastReaction.set(ws, now);
    broadcastTo(this.ctx, { type: "reaction", emoji, from: att.displayName, fromId: att.participantId });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.live(() => this.closed(ws));
  }

  private async closed(ws: WebSocket): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta?.status === "swiping") await allowReturn(this.ctx, this.env, ws);
    await beginHostGraceIfNeeded(this.ctx, this.env, ws);
    await broadcastSessionState(this.ctx, ws);
    if (meta?.status === "swiping") await this.rounds.evaluate(meta, ws);
  }

  /** Run whichever deadlines have passed - hand off host, decide the round, or both - then reschedule
   *  anything still pending. */
  override async alarm(): Promise<void> {
    await this.live(() => this.tick());
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    let hostChanged = false;

    const grace = await this.ctx.storage.get<number>("hostGraceUntil");
    if (grace && now >= grace) {
      const departedHostId = await this.ctx.storage.get<string>("departedHostId");
      await this.ctx.storage.delete(["hostGraceUntil", "departedHostId"]);
      const hostId = await this.ctx.storage.get<string>("hostId");
      if (hostId && hostId === departedHostId && !hasLiveSocketFor(this.ctx, hostId)) {
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

    if (await updateReturnGrace(this.ctx)) {
      const meta = await this.ctx.storage.get<SessionMeta>("meta");
      if (meta?.status === "swiping") await this.rounds.evaluate(meta);
    }
    await rescheduleAlarm(this.ctx);
    if (hostChanged) await broadcastSessionState(this.ctx);
  }

  // ---- handlers ----

  private async handleJoin(
    ws: WebSocket,
    displayName: string,
    clientId: string | undefined,
    lazyPlaces: boolean,
  ): Promise<void> {
    if (socketIdentity(ws)) return;
    if (attachmentsOn(this.ctx).length >= 32) {
      return sendTo(ws, { type: "error", message: "This room is full." });
    }
    const meta = await roomForJoin(this.ctx);
    if (!meta) {
      return sendTo(ws, {
        type: "error",
        message: "That session does not exist.",
      });
    }

    const identity = await resolveIdentity(this.ctx.storage, clientId);
    if (identity === "unowned")
      return sendTo(ws, {
        type: "error",
        message: "This older room has no verified host. Start a new room.",
      });
    if (!identity)
      return sendTo(ws, { type: "error", message: "This room has reached its participant limit." });
    ws.serializeAttachment({ ...identity, displayName });
    if (await updateReturnGrace(this.ctx, identity.participantId)) await rescheduleAlarm(this.ctx);

    // If the host is (back) online — this socket may be their reconnect — cancel the host-grace
    // deadline so a refresh never hands off host. Keep any round timer running (rescheduleAlarm).
    const hostId = await this.ctx.storage.get<string>("hostId");
    if (hostId && hasLiveSocketFor(this.ctx, hostId)) {
      await this.ctx.storage.delete(["hostGraceUntil", "departedHostId"]);
      await rescheduleAlarm(this.ctx);
    }

    sendTo(ws, { type: "identity", participantId: identity.participantId });

    await broadcastSessionState(this.ctx);
    if (meta.status === "lobby") await sendVibes(this.ctx);

    if (meta.status === "swiping") {
      if (
        !(await sendResumedDeck(this.ctx.storage, this.rounds.places, ws, identity.participantId, lazyPlaces))
      )
        return;
      await this.rounds.evaluate(meta);
    } else if (meta.status === "decided") {
      await this.sendResult(ws, meta);
    }
    sendTo(ws, {
      type: "history",
      visited: await presentHistory(this.env, meta.code, this.rounds.places),
    });
  }

  private async resultContext(): Promise<{ total: number; vetoedCount: number; round: number }> {
    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    return {
      total:
        (await this.ctx.storage.get<number>("verdictTotal")) ??
        Math.max(
          attachmentsOn(this.ctx).length,
          new Set(Object.values(votes).map((vote) => vote.participantId)).size,
        ),
      vetoedCount: vetoedRestaurantIds(Object.values(votes)).size,
      round: await readRoundNumber(this.ctx.storage),
    };
  }

  private async sendResult(ws: WebSocket, meta: SessionMeta): Promise<void> {
    const stored = (await this.ctx.storage.get<DecisionResult | null>("winner")) ?? null;
    const { total, vetoedCount, round } = await this.resultContext();
    const result = stored ? await this.rounds.places.showVerdict(stored, meta.filters) : null;
    const demo = await readDemoMode(this.ctx.storage);
    const current = await this.ctx.storage.get<SessionMeta>("meta");
    if (current?.status !== "decided" || round !== (await readRoundNumber(this.ctx.storage))) return;
    const winner = await this.ctx.storage.get<DecisionResult>("winner");
    if (winner?.restaurant.id === stored?.restaurant.id && ws.readyState === WebSocket.OPEN)
      sendTo(ws, resultMessage(result, total, vetoedCount, round, demo));
  }
}
