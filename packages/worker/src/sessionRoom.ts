import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import {
  clientMessageSchema,
  finishedParticipantIds,
  promoteAlternative,
  tastePulse,
  decideWinner,
  vetoedRestaurantIds,
  type DecisionResult,
  type Participant,
  type PlannedMeetup,
  type Restaurant,
  type ServerMessage,
  type Session,
  type SessionFilters,
  type SessionStatus,
  type SwipeDirection,
  type VisitedPlace,
  type Vote,
  type VoteMode,
  applyVibe,
  cardsBehind,
  vibeEffectLine,
  resolveVibe,
  shuffleDeck,
  type Vibe,
  type DemoReason,
  blockedIds,
} from "@wherever/shared";
import { createRestaurantSource, MockRestaurantSource, isDemoSource } from "./restaurantSource.js";
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

// Grace window after the host's last socket drops before host is handed to someone else. Long enough
// that a refresh or a brief network blip keeps the host as host; short enough that a group isn't
// stranded for long if the host genuinely leaves. Reassignment happens in alarm().
const HOST_GRACE_MS = 15_000;

/** Long enough that nudging is a decision, not a drum roll. */
const NUDGE_COOLDOWN_MS = 20_000;

/** clientId -> stable identity, so a reconnecting client keeps its votes. */
type ClientMap = Record<string, { participantId: string; isHost: boolean }>;
/** Votes keyed by `${participantId}:${restaurantId}` for idempotency. */
type VoteMap = Record<string, Vote>;
/**
 * Who picked which vibe. Never leaves this object - clients get tallies only, so "nobody finds out
 * who said fancy" is a property of the server rather than of every screen that renders it.
 */
type VibeMap = Record<string, Vibe>;

/**
 * One per session, addressed by session code. Owns every socket in the room and the live votes.
 *
 * Single-threaded, so counting a vote and deciding a winner cannot interleave: the check-and-flip in
 * `decide` fires the result exactly once with no locks. See docs/adr/0001-durable-objects.md.
 *
 * Every rule below is enforced here, not by hiding a control. A hidden button is not a rule.
 */
export class SessionRoom extends DurableObject<Env> {
  /*
   * One start at a time. The status flip in handleStartRound deliberately happens after the Places
   * fetch so a failed fetch leaves everyone in the lobby to retry, and that gap let a host who
   * double-tapped through the `status !== "lobby"` guard twice. Each pass charges the budget meter
   * for its own Google search. In memory rather than storage on purpose: an evicted instance comes
   * back able to start, which is the safe direction for a flag whose only job is to close a gap
   * between two awaits.
   */
  private starting = false;

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
        return this.handleStartRound(ws);
      case "swipe":
        return this.handleSwipe(ws, msg.restaurantId, msg.direction, msg.super ?? false, msg.veto ?? false);
      case "undo_swipe":
        return this.handleUndoSwipe(ws, msg.restaurantId);
      case "decide_now":
        return this.handleDecideNow(ws);
      case "again":
        return this.handleAgain(ws);
      case "choose_alternative":
        return this.handleChooseAlternative(ws, msg.restaurantId);
      case "set_plan":
        return this.handleSetPlan(ws, msg.planned);
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

    const vibes = (await this.ctx.storage.get<VibeMap>("vibes")) ?? {};
    if (vibe) vibes[att.participantId] = vibe;
    else delete vibes[att.participantId];
    await this.ctx.storage.put("vibes", vibes);
    await this.broadcastVibes(vibes);
  }

  /**
   * Tallies to everyone, plus each person's own pick back to them. One message per socket rather than
   * a broadcast, because `yours` is the only field that differs per recipient.
   */
  private async broadcastVibes(vibes?: VibeMap): Promise<void> {
    const map = vibes ?? (await this.ctx.storage.get<VibeMap>("vibes")) ?? {};
    const counts: Partial<Record<Vibe, number>> = {};
    for (const picked of Object.values(map)) counts[picked] = (counts[picked] ?? 0) + 1;
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() as SocketAttachment | null;
      if (!att) continue;
      this.send(socket, { type: "vibes", counts, yours: map[att.participantId] ?? null });
    }
  }

  private async vibeCounts(): Promise<Partial<Record<Vibe, number>>> {
    const map = (await this.ctx.storage.get<VibeMap>("vibes")) ?? {};
    const counts: Partial<Record<Vibe, number>> = {};
    for (const picked of Object.values(map)) counts[picked] = (counts[picked] ?? 0) + 1;
    return counts;
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
    // Anyone in the room may set this -- it is the group's memory, not the host's. But it was the one
    // mutation that never looked at who was asking, so a socket that opened and never joined could
    // block a restaurant from every future deck. Not host-only; joined.
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;
    const db = drizzle(this.env.DB);
    await db
      .update(visitedPlaces)
      .set({ neverAgain })
      .where(and(eq(visitedPlaces.sessionCode, meta.code), eq(visitedPlaces.restaurantId, restaurantId)));
    this.broadcast({ type: "history", visited: await this.getVisited(meta.code) });
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

    const deck = await this.getOrCreateDeck(meta);
    const votes = await this.getVotes();
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
    await this.scheduleHostReassignIfNeeded(ws);
    await this.broadcastState(ws);
    // A departure drops the participant count — re-check completion (excluding the closing socket,
    // which getWebSockets still returns here) so a finished group decides instead of stalling on
    // the person who just left.
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (meta?.status === "swiping") await this.evaluate(meta, ws);
  }

  /** Any live socket for this participant (optionally excluding one, e.g. the closing socket). */
  private hasLiveSocketFor(participantId: string, exclude?: WebSocket): boolean {
    return this.ctx.getWebSockets().some((s) => {
      if (s === exclude) return false;
      const a = s.deserializeAttachment() as SocketAttachment | null;
      return a?.participantId === participantId;
    });
  }

  /**
   * One alarm per Durable Object, and two timers need it: the host-reassign grace window and the round
   * countdown. Set it to whichever deadline is nearer, or clear it when neither is pending. Callers set
   * `hostGraceUntil` / `roundEndsAt` and then call this.
   */
  private async rescheduleAlarm(): Promise<void> {
    const times: number[] = [];
    const grace = await this.ctx.storage.get<number>("hostGraceUntil");
    const roundEnd = await this.ctx.storage.get<number>("roundEndsAt");
    if (grace) times.push(grace);
    if (roundEnd) times.push(roundEnd);
    if (times.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  /**
   * Don't hand off host the moment their last socket drops: a refresh or a blip would demote them.
   * Start a grace window instead, and only reassign in `alarm()` if they are still gone.
   */
  private async scheduleHostReassignIfNeeded(closing: WebSocket): Promise<void> {
    const att = closing.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) return;
    const hostId = await this.ctx.storage.get<string>("hostId");
    if (hostId !== att.participantId) return;
    // Still present on another socket (second tab)? They're not gone at all.
    if (this.hasLiveSocketFor(att.participantId, closing)) return;
    await this.ctx.storage.put("hostGraceUntil", Date.now() + HOST_GRACE_MS);
    await this.rescheduleAlarm();
  }

  /** Set (or clear) the round countdown from the session's roundSeconds; returns the deadline. */
  private async setRoundDeadline(meta: SessionMeta): Promise<number | undefined> {
    const secs = meta.filters.roundSeconds ?? 0;
    if (secs > 0) {
      const deadline = Date.now() + secs * 1000;
      await this.ctx.storage.put("roundEndsAt", deadline);
      await this.rescheduleAlarm();
      return deadline;
    }
    await this.ctx.storage.delete("roundEndsAt");
    await this.rescheduleAlarm();
    return undefined;
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
      if (hostId && !this.hasLiveSocketFor(hostId)) {
        await this.reassignHostAway(hostId);
        hostChanged = true;
      }
    }

    const roundEnd = await this.ctx.storage.get<number>("roundEndsAt");
    if (roundEnd && now >= roundEnd) {
      await this.ctx.storage.delete("roundEndsAt");
      const meta = await this.ctx.storage.get<SessionMeta>("meta");
      if (meta?.status === "swiping") await this.decide(meta); // time's up → tally decides
    }

    await this.rescheduleAlarm();
    if (hostChanged) await this.broadcastState();
  }

  /**
   * Move host to another connected person, or clear it if the room emptied. Host is cached in three
   * places - the `hostId` record, the `clientMap`, and each live socket attachment - so all three move
   * together or a reconnect picks up the old answer.
   */
  private async reassignHostAway(oldHostId: string): Promise<void> {
    let newHostId: string | undefined;
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as SocketAttachment | null;
      if (a && a.participantId !== oldHostId) {
        newHostId = a.participantId;
        break;
      }
    }

    const map = (await this.ctx.storage.get<ClientMap>("clientMap")) ?? {};
    for (const [key, entry] of Object.entries(map)) {
      if (entry.participantId === oldHostId) map[key] = { ...entry, isHost: false };
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
    if (hostId && this.hasLiveSocketFor(hostId)) {
      await this.ctx.storage.delete("hostGraceUntil");
      await this.rescheduleAlarm();
    }

    // Tell the client its own participantId so it identifies itself by a stable id, not by display
    // name (two participants can share a name, which otherwise misattaches host controls).
    this.send(ws, { type: "identity", participantId: identity.participantId });

    await this.broadcastState();
    this.send(ws, { type: "history", visited: await this.getVisited(meta.code) });

    // Whoever just walked in needs the tallies and their own pick back, which a reconnect also relies on
    // to re-select the button they had already chosen.
    if (meta.status === "lobby") await this.broadcastVibes();

    if (meta.status === "swiping") {
      const deck = await this.getOrCreateDeck(meta);
      const votes = await this.getVotes();
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
        demo: await this.isDemoMode(),
        roundEndsAt: (await this.ctx.storage.get<number>("roundEndsAt")) ?? undefined,
      });
      await this.evaluate(meta); // refresh progress for the new arrival
    } else if (meta.status === "decided") {
      await this.sendResult(ws);
      this.send(ws, {
        type: "plan",
        planned: (await this.ctx.storage.get<PlannedMeetup>("plannedMeetup")) ?? null,
      });
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
    if (this.starting) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;

    // Fetch BEFORE flipping to swiping: if the Places call fails we stay in the lobby and let the
    // host retry, rather than stranding everyone on an empty "swiping" screen. (An empty-but-ok
    // result is distinct — that legitimately shows "nothing survived the filters".)
    this.starting = true;
    let deck: Restaurant[];
    try {
      deck = await this.getOrCreateDeck(meta);
    } catch {
      return this.send(ws, {
        type: "error",
        message: "couldn't load restaurants right now. give it a moment and try again.",
      });
    } finally {
      this.starting = false;
    }

    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    this.broadcast({
      type: "deck",
      restaurants: deck,
      demo: await this.isDemoMode(),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
    });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  private async handleSwipe(
    ws: WebSocket,
    restaurantId: string,
    direction: SwipeDirection,
    isSuper: boolean,
    isVeto: boolean,
  ): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;

    /*
     * The vote has to be for a card that was actually dealt.
     *
     * "Finished the deck" counts distinct restaurant ids voted on, so without this a client could send
     * `deckSize` invented ids and be finished without seeing a card. Every one of those ids also becomes
     * a key in the vote map, which is Durable Object storage.
     */
    const deck = (await this.ctx.storage.get<Restaurant[]>("deck")) ?? [];
    if (!deck.some((r) => r.id === restaurantId)) return;

    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    // One super-like per participant per round (server-enforced): a super only sticks on a right
    // swipe, and only if they haven't already spent it on a still-standing vote. Otherwise it's a
    // normal right-swipe.
    let superLike = isSuper && direction === "right";
    if (superLike) {
      const spent = Object.values(votes).some((v) => v.participantId === att.participantId && v.super);
      if (spent) superLike = false;
    }
    // One veto per participant per round, enforced here for the same reason as the super-like: the
    // client hides a spent button, and a hidden button is not a rule. A veto removes a place from
    // contention outright, so a client that simply sent the flag twice could quietly clear the deck.
    let vetoing = isVeto && direction === "left";
    if (vetoing) {
      const spent = Object.values(votes).some((v) => v.participantId === att.participantId && v.veto);
      if (spent) vetoing = false;
    }
    // Keyed by participant+restaurant: a re-vote overwrites, never double-counts.
    votes[`${att.participantId}:${restaurantId}`] = {
      participantId: att.participantId,
      restaurantId,
      direction,
      ...(superLike ? { super: true } : {}),
      ...(vetoing ? { veto: true } : {}),
    };
    await this.ctx.storage.put("votes", votes);

    /*
     * Both land on the whole room, and both are anonymous: it learns one happened, never who spent it or
     * on what. Naming a veto turns "I can't eat there" into an argument, which is the conversation this
     * app exists to avoid.
     *
     * The super-like carries no name for the same reason. It is a weighted vote, and "the server never
     * sends per-voter identities" has to hold on every channel, not just the progress payload.
     */
    if (superLike) this.broadcast({ type: "reaction", emoji: "⭐", from: "", kind: "super" });
    if (vetoing) this.broadcast({ type: "reaction", emoji: "🚫", from: "", kind: "veto" });

    await this.evaluate(meta);
  }

  /**
   * Rewind belongs here too. Removing the card only in React would leave the original vote in the
   * tally, turning the replacement into an overwrite that can keep a spent super or veto. The
   * participant comes from the socket, so nobody can rewind somebody else's choice.
   */
  private async handleUndoSwipe(ws: WebSocket, restaurantId: string): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    const key = `${att.participantId}:${restaurantId}`;
    if (!votes[key]) return;
    delete votes[key];
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

  /** Let the host rescue a good result when the winning place is impractical, without another round. */
  private async handleChooseAlternative(ws: WebSocket, restaurantId: string): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, { type: "error", message: "Only the host can switch the final pick." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    const result = await this.ctx.storage.get<DecisionResult | null>("winner");
    if (!meta || meta.status !== "decided" || !result) return;

    const promoted = promoteAlternative(result, restaurantId);
    if (!promoted) {
      return this.send(ws, { type: "error", message: "That place is no longer a finalist." });
    }

    await this.ctx.storage.put("winner", promoted);
    await this.recordVisit(meta.code, promoted.restaurant.id, promoted.restaurant.name);
    const votes = await this.getVotes();
    const round = ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1;
    this.broadcastResult(
      promoted,
      this.connectedParticipants().length,
      vetoedRestaurantIds(votes).size,
      round,
    );
    await this.broadcastHistory(meta.code);
  }

  /** Keep the post-decision meetup time consistent for every device in the room. */
  private async handleSetPlan(ws: WebSocket, planned: PlannedMeetup | null): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, { type: "error", message: "Only the host can set the meetup time." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;
    if (planned && new Date(planned.start).getTime() < Date.now() - 60_000) {
      return this.send(ws, { type: "error", message: "Pick a meetup time that hasn't happened yet." });
    }

    if (planned) await this.ctx.storage.put("plannedMeetup", planned);
    else await this.ctx.storage.delete("plannedMeetup");
    this.broadcast({ type: "plan", planned });
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
    const pulse = tastePulse(deck, votes);

    this.broadcast({
      type: "vote_progress",
      finishedCount: finishedIds.length,
      totalParticipants: total,
      votesCast: votes.length,
      ...(pulse ? { tastePulse: pulse } : {}),
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
    // Round's over — drop any pending countdown so its alarm can't fire on a decided round.
    await this.ctx.storage.delete("roundEndsAt");
    await this.rescheduleAlarm();

    const deck = await this.getOrCreateDeck(meta);
    const votes = await this.getVotes();
    const result = decideWinner(deck, votes);
    await this.ctx.storage.put("winner", result);

    // The chosen place joins the group's history so it drops out of next time.
    if (result) {
      await this.recordVisit(meta.code, result.restaurant.id, result.restaurant.name);
    }

    const round = ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1;
    this.broadcastResult(result, this.connectedParticipants().length, vetoedRestaurantIds(votes).size, round);
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
    await this.ctx.storage.delete("plannedMeetup");
    await this.ctx.storage.put("againRounds", rounds + 1);
    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    this.broadcast({
      type: "deck",
      restaurants: deck,
      demo: await this.isDemoMode(),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
    });
    await this.broadcastState();
    await this.evaluate(meta);
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
    const apiKey = kind === "google" ? this.env.GOOGLE_PLACES_API_KEY : undefined;

    // A real Google search is about to happen → charge it against the monthly budget first. If the
    // budget is spent, don't call Google: fall back to the sample deck so the app stays playable as
    // a demo, and flag it so the client can explain why the data is stand-in.
    let source;
    let demo: DemoReason | undefined;
    if (kind === "google" && apiKey) {
      const meter = this.env.USAGE_METER.get(this.env.USAGE_METER.idFromName("global"));
      if (await meter.tryConsume("search")) {
        source = createRestaurantSource(kind, apiKey, this.env.PUBLIC_API_BASE);
      } else {
        source = new MockRestaurantSource();
        demo = "budget";
      }
    } else {
      source = createRestaurantSource(kind, apiKey, this.env.PUBLIC_API_BASE);
      // Same flag the spent-budget path sets: whatever the reason, the room is being told these
      // places are stand-ins rather than being left to assume they are real.
      demo = isDemoSource(kind, apiKey) ? "sample" : undefined;
    }

    /*
     * The vibe, folded into the filters the deck is actually fetched with, and saved onto the session so
     * the summary everyone is reading describes the deck they were dealt. No vibe changes nothing, which
     * is why it is opt-in.
     */
    const reading = resolveVibe(await this.vibeCounts());
    if (reading.vibe) {
      // Describe the change before making it: applyVibe overwrites the very filters it is measured
      // against, and this is the only place both halves exist.
      await this.ctx.storage.put("vibeEffect", vibeEffectLine(reading.vibe, meta.filters));
      meta.filters = applyVibe(meta.filters, reading.vibe);
      await this.ctx.storage.put("meta", meta);
    } else {
      await this.ctx.storage.delete("vibeEffect");
    }

    const all = await source.fetchDeck(meta.filters);
    /* Everywhere the group has been, minus the ones whose cooldown expired. Excluding them forever meant
       a group that actually used the app shrank its own deck one dinner at a time. See revisit.ts. */
    const visited = await this.getVisited(meta.code);
    const blocked = blockedIds(visited);
    const filtered = all.filter((r) => !blocked.has(r.id));
    // Seeded on the code so the same session always deals the same chaos, which is debuggable.
    const deck = meta.filters.shuffle ? shuffleDeck(filtered, meta.code) : filtered;
    await this.ctx.storage.put("deck", deck);
    await this.ctx.storage.put("demoMode", demo ?? null);
    return deck;
  }

  /** Whether the current deck is the sample fallback served because the live-data budget is spent. */
  private async isDemoMode(): Promise<DemoReason | undefined> {
    /* Stored as a reason since the deck was fetched. `null` for a real deck, and `true` for a room
       whose deck predates this field, which was only ever set for the budget case. */
    const held = await this.ctx.storage.get<DemoReason | boolean | null>("demoMode");
    if (held === true) return "budget";
    return held === null || held === false ? undefined : held;
  }

  private async getVisited(code: string): Promise<VisitedPlace[]> {
    const db = drizzle(this.env.DB);
    const rows = await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, code));
    return rows.map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      visitedAt: r.visitedAt.toISOString(),
      ...(r.neverAgain ? { neverAgain: true } : {}),
    }));
  }

  private async recordVisit(code: string, restaurantId: string, name: string): Promise<void> {
    const db = drizzle(this.env.DB);
    const existing = await db
      .select({ id: visitedPlaces.id })
      .from(visitedPlaces)
      .where(and(eq(visitedPlaces.sessionCode, code), eq(visitedPlaces.restaurantId, restaurantId)))
      .get();
    if (existing) return;
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
    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    const vetoedCount = vetoedRestaurantIds(Object.values(votes)).size;
    // againRounds counts the re-deals, so the round that decided it is one more than that.
    const round = ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1;
    if (result) {
      this.send(ws, {
        type: "match",
        restaurant: result.restaurant,
        rightSwipes: result.rightSwipes,
        alternatives: result.alternatives ?? [],
        totalParticipants: total,
        vetoedCount,
        tiedWith: result.tiedWith,
        vetoedTop: result.vetoedTop,
        round,
      });
    } else {
      this.send(ws, { type: "no_match", vetoedCount });
    }
  }

  private async broadcastHistory(code: string): Promise<void> {
    this.broadcast({ type: "history", visited: await this.getVisited(code) });
  }

  private broadcastResult(
    result: DecisionResult | null,
    total: number,
    vetoedCount: number,
    round: number,
  ): void {
    if (result) {
      this.broadcast({
        type: "match",
        restaurant: result.restaurant,
        rightSwipes: result.rightSwipes,
        alternatives: result.alternatives ?? [],
        totalParticipants: total,
        vetoedCount,
        tiedWith: result.tiedWith,
        vetoedTop: result.vetoedTop,
        round,
      });
    } else {
      this.broadcast({ type: "no_match", vetoedCount });
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
