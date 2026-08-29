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
  type ArrivalStatus,
  type ArrivalUpdate,
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
  resolveVibe,
  type Vibe,
  blockedIds,
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

// Grace window after the host's last socket drops before host is handed to someone else. Long enough
// that a refresh or a brief network blip keeps the host as host; short enough that a group isn't
// stranded for long if the host genuinely leaves. Reassignment happens in alarm().
const HOST_GRACE_MS = 15_000;

/** clientId -> stable identity, so a reconnecting client keeps its votes. */
type ClientMap = Record<string, { participantId: string; isHost: boolean }>;
/** Votes keyed by `${participantId}:${restaurantId}` for idempotency. */
type VoteMap = Record<string, Vote>;
type ArrivalMap = Record<string, ArrivalUpdate>;
/**
 * participantId -> the vibe they picked.
 *
 * Never leaves this object. Clients receive tallies only, so the "nobody finds out who said fancy"
 * promise is a property of the server rather than of every screen that renders it.
 */
type VibeMap = Record<string, Vibe>;

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
      case "set_arrival":
        return this.handleSetArrival(ws, msg.status, msg.travelMinutes);
      case "set_vibe":
        return this.handleSetVibe(ws, msg.vibe);
      case "set_filters":
        return this.handleSetFilters(ws, msg.filters);
      case "set_never_again":
        return this.handleSetNeverAgain(msg.restaurantId, msg.neverAgain);
      case "react":
        return this.handleReact(ws, msg.emoji);
    }
  }

  /**
   * One person's vibe pick, tallied and fanned out without naming anybody.
   *
   * Lobby only: the vibe decides which deck gets fetched, so allowing changes mid-round would mean two
   * people were voting on different restaurants. Enforced here rather than by hiding the control, since
   * a hidden control is not a rule.
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
   * Send every client the tallies, and each client its own pick and nobody else's.
   *
   * One message per socket rather than one broadcast, because `yours` differs per recipient. That is the
   * only per-client field, and it is the client's own answer being handed back to it.
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

  /**
   * Change the filters, from the lobby, as the host.
   *
   * Host-only because these are one shared set of rules for everybody's deck, and lobby-only because
   * changing them mid-round would deal two people different restaurants. Both enforced here: the client
   * hides the controls from non-hosts, and a hidden control has never been a rule.
   */
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
   * Mark somewhere as never-again, or take it back.
   *
   * Only touches a place the group has actually been: this is a note on a visit, not a way to blacklist
   * arbitrary ids, and without the check anybody with the code could quietly shrink the deck.
   */
  private async handleSetNeverAgain(restaurantId: string, neverAgain: boolean): Promise<void> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta) return;
    const db = drizzle(this.env.DB);
    await db
      .update(visitedPlaces)
      .set({ neverAgain })
      .where(and(eq(visitedPlaces.sessionCode, meta.code), eq(visitedPlaces.restaurantId, restaurantId)));
    this.broadcast({ type: "history", visited: await this.getVisited(meta.code) });
  }

  /** Fan an ephemeral emoji reaction out to everyone in the session. */
  private handleReact(ws: WebSocket, emoji: string): void {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    this.broadcast({ type: "reaction", emoji, from: att.displayName });
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
   * A Durable Object has a single alarm, so both timers — host-reassign grace and the round
   * countdown — are multiplexed through here: set the alarm to the earliest pending deadline, or
   * clear it when neither is pending. Callers set/clear `hostGraceUntil` / `roundEndsAt` then call
   * this.
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
   * When the host's last socket drops, DON'T hand off host immediately — a refresh or a brief blip
   * would otherwise demote them. Instead start a grace window; host is only reassigned in alarm() if
   * they haven't reconnected by then. The host stays host throughout, so a reconnect resumes cleanly.
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

  /**
   * The multiplexed alarm: run whichever deadlines have elapsed — hand host off if the grace window
   * passed with them still gone, and/or decide the round if its countdown ran out — then reschedule
   * anything still pending.
   */
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
   * Move host off `oldHostId` to another connected participant, or clear it if the room is empty.
   * host is cached in three places — the `hostId` record, the `clientMap`, and each live socket
   * attachment — so all three are updated and the new host keeps it across a reconnect.
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
      this.send(ws, {
        type: "deck",
        restaurants: deck,
        alreadyVoted,
        superUsed,
        vetoUsed,
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
      this.send(ws, {
        type: "arrivals",
        arrivals: Object.values((await this.ctx.storage.get<ArrivalMap>("arrivals")) ?? {}),
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
    const roundEndsAt = await this.setRoundDeadline(meta);
    this.broadcast({ type: "deck", restaurants: deck, demo: await this.isDemoMode(), roundEndsAt });
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

    const votes = (await this.ctx.storage.get<VoteMap>("votes")) ?? {};
    // One super-like per participant per round (server-enforced): a super only sticks on a right
    // swipe, and only if they haven't already spent it on a still-standing vote. Otherwise it's a
    // normal right-swipe.
    let superLike = isSuper && direction === "right";
    if (superLike) {
      const spent = Object.values(votes).some(
        (v) => v.participantId === att.participantId && v.super,
      );
      if (spent) superLike = false;
    }
    // One veto per participant per round, enforced here for the same reason as the super-like: the
    // client hides a spent button, and a hidden button is not a rule. A veto removes a place from
    // contention outright, so a client that simply sent the flag twice could quietly clear the deck.
    let vetoing = isVeto && direction === "left";
    if (vetoing) {
      const spent = Object.values(votes).some(
        (v) => v.participantId === att.participantId && v.veto,
      );
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

    // Let the whole room feel the super-like — reuses the floating-reaction channel.
    if (superLike) this.broadcast({ type: "reaction", emoji: "⭐", from: att.displayName });
    // A veto is anonymous, like every other vote in a round: the room learns that one landed, never
    // who spent it or on what. Naming it would turn "I can't eat there" into an argument, which is
    // the conversation this app exists to avoid.
    if (vetoing) this.broadcast({ type: "reaction", emoji: "🚫", from: "" });

    await this.evaluate(meta);
  }

  /**
   * Rewind belongs on the server too: removing only the card in React would leave the original vote
   * in the tally and turn the replacement into an overwrite that may keep a spent super/veto. The
   * participant id comes from the socket attachment, so nobody can rewind somebody else's choice.
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

  /** Arrival updates are self-owned, but shared and durable for people joining the plan later. */
  private async handleSetArrival(ws: WebSocket, status: ArrivalStatus | null, travelMinutes?: number): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att) return;
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;
    const arrivals = (await this.ctx.storage.get<ArrivalMap>("arrivals")) ?? {};
    if (status) {
      const previous = arrivals[att.participantId];
      const estimate = travelMinutes ?? previous?.travelMinutes;
      arrivals[att.participantId] = {
        participantId: att.participantId,
        displayName: att.displayName,
        status,
        ...(estimate ? { travelMinutes: estimate } : {}),
        updatedAt: new Date().toISOString(),
      };
    } else {
      delete arrivals[att.participantId];
    }
    await this.ctx.storage.put("arrivals", arrivals);
    this.broadcast({ type: "arrivals", arrivals: Object.values(arrivals) });
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
    await this.ctx.storage.delete("arrivals");
    await this.ctx.storage.put("againRounds", rounds + 1);
    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    const roundEndsAt = await this.setRoundDeadline(meta);
    this.broadcast({ type: "deck", restaurants: deck, demo: await this.isDemoMode(), roundEndsAt });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  // ---- helpers ----

  private async resolveIdentity(
    clientId?: string,
  ): Promise<{ participantId: string; isHost: boolean }> {
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

    /*
     * The group's mood, folded into the filters the deck is actually fetched with.
     *
     * Persisted onto the session rather than applied only here, so the filter summary everyone is looking
     * at describes the deck they were dealt. No vibe leaves the host's filters exactly as they were, which
     * is why this is opt-in: a session where nobody picks is unchanged.
     */
    const reading = resolveVibe(await this.vibeCounts());
    if (reading.vibe) {
      meta.filters = applyVibe(meta.filters, reading.vibe);
      await this.ctx.storage.put("meta", meta);
    }

    const all = await source.fetchDeck(meta.filters);
    /*
     * Everywhere the group has been, minus the ones whose cooldown has run out.
     *
     * This used to exclude every visited place for good, which meant a group that actually used the app
     * shrank its own deck one dinner at a time until nothing was left. See revisit.ts.
     */
    const visited = await this.getVisited(meta.code);
    const blocked = blockedIds(visited);
    const deck = all.filter((r) => !blocked.has(r.id));
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
      ...(r.neverAgain ? { neverAgain: true } : {}),
    }));
  }

  private async recordVisit(
    code: string,
    restaurantId: string,
    name: string,
  ): Promise<void> {
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
