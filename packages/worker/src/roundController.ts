import {
  decideWinner,
  finishedParticipantIds,
  promoteAlternative,
  tastePulse,
  vetoedRestaurantIds,
  type DecisionResult,
  type Restaurant,
  type ServerMessage,
  type SwipeDirection,
} from "@wherever/shared";
import type { Env } from "./env.js";
import type { SessionMeta, SocketAttachment, VoteMap } from "./roomState.js";
import { readVotes } from "./roomState.js";
import { writeEvent } from "./events.js";
import { rescheduleAlarm } from "./hostHandover.js";
import { vibeCounts } from "./vibeTally.js";
import { attachmentsOn, broadcastSessionState, broadcastTo, resultMessage, sendTo } from "./roomSockets.js";
import { getOrCreateDeck, nextRoundDeck, readDemoMode, recordVisit, visitedFor } from "./deckSource.js";

const MAX_AGAIN_ROUNDS = 20;

/** Storage-backed round transitions, voting, and verdicts for one room. */
export class RoundController {
  private transitioning = false;
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}
  /** Set (or clear) the round countdown from the session's roundSeconds; returns the deadline. */
  private async setRoundDeadline(meta: SessionMeta): Promise<number | undefined> {
    const secs = meta.filters.roundSeconds ?? 0;
    if (secs > 0) {
      const deadline = Date.now() + secs * 1000;
      await this.ctx.storage.put("roundEndsAt", deadline);
      await rescheduleAlarm(this.ctx);
      return deadline;
    }
    await this.ctx.storage.delete("roundEndsAt");
    await rescheduleAlarm(this.ctx);
    return undefined;
  }

  async handleStartRound(ws: WebSocket): Promise<void> {
    await this.transition(() => this.startRound(ws));
  }

  async handleAgain(ws: WebSocket, mode: "new" | "same"): Promise<void> {
    await this.transition(() => this.again(ws, mode));
  }

  // External provider awaits can admit another event; hold the guard through the status write.
  private async transition(run: () => Promise<void>): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    try {
      await run();
    } finally {
      this.transitioning = false;
    }
  }

  private async startRound(ws: WebSocket): Promise<void> {
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
      deck = await this.deckFor(meta);
    } catch {
      return this.send(ws, {
        type: "error",
        message: "couldn't load restaurants right now. give it a moment and try again.",
      });
    }

    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    this.broadcast({
      type: "deck",
      restaurants: deck,
      demo: await readDemoMode(this.ctx.storage),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
    });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  async handleSwipe(
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

    // Reject undealt IDs before counting progress or adding entries to the stored vote map.
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
      else writeEvent(this.env, "super_like_used");
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
     * The star goes back to the presser alone: everyone swipes at their own pace, so on another
     * screen it lands over a card it is not about. The veto fans out because it takes a place off
     * everybody's list, and it needs a crowd to hide in -- with two people, anonymity is arithmetic.
     * Below three it lands silently and still counts.
     */
    if (superLike) this.send(ws, { type: "reaction", emoji: "⭐", from: "", kind: "super" });
    if (vetoing && this.connectedParticipants().length >= 3) {
      this.broadcast({ type: "reaction", emoji: "🚫", from: "", kind: "veto" });
    }

    await this.evaluate(meta);
  }

  /**
   * Rewind belongs here too. Removing the card only in React would leave the original vote in the
   * tally, turning the replacement into an overwrite that can keep a spent super or veto. The
   * participant comes from the socket, so nobody can rewind somebody else's choice.
   */
  async handleUndoSwipe(ws: WebSocket, restaurantId: string): Promise<void> {
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

  async handleDecideNow(ws: WebSocket): Promise<void> {
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
  async handleChooseAlternative(ws: WebSocket, restaurantId: string): Promise<void> {
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
    await recordVisit(this.env, meta.code, promoted.restaurant.id, promoted.restaurant.name);
    const votes = await readVotes(this.ctx.storage);
    const round = ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1;
    this.broadcastResult(
      promoted,
      this.connectedParticipants().length,
      vetoedRestaurantIds(votes).size,
      round,
    );
    await this.broadcastHistory(meta.code);
  }

  // ---- core round logic ----

  /** Recompute + broadcast progress, then decide if everyone connected is done. */
  async evaluate(meta: SessionMeta, excludeWs?: WebSocket): Promise<void> {
    const deck = await this.deckFor(meta);
    const votes = await readVotes(this.ctx.storage);
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
  async decide(meta: SessionMeta): Promise<void> {
    if (meta.status !== "swiping") return; // already decided; do nothing
    meta.status = "decided";
    writeEvent(this.env, "session_decided", "", "", this.connectedParticipants().length);
    await this.ctx.storage.put("meta", meta);
    // Round's over — drop any pending countdown so its alarm can't fire on a decided round.
    await this.ctx.storage.delete("roundEndsAt");
    await rescheduleAlarm(this.ctx);

    const deck = await this.deckFor(meta);
    const votes = await readVotes(this.ctx.storage);
    const result = decideWinner(deck, votes);
    await this.ctx.storage.put("winner", result);

    // The chosen place joins the group's history so it drops out of next time.
    if (result) {
      await recordVisit(this.env, meta.code, result.restaurant.id, result.restaurant.name);
    }

    const round = ((await this.ctx.storage.get<number>("againRounds")) ?? 0) + 1;
    this.broadcastResult(result, this.connectedParticipants().length, vetoedRestaurantIds(votes).size, round);
    await this.broadcastHistory(meta.code);
    await this.broadcastState();
  }

  /** Host runs the round again, on new places or on the same ones. */
  private async again(ws: WebSocket, mode: "new" | "same"): Promise<void> {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    if (!att?.isHost) {
      return this.send(ws, { type: "error", message: "Only the host can run it back." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;

    const rounds = (await this.ctx.storage.get<number>("againRounds")) ?? 0;
    const dealt = (await this.ctx.storage.get<Restaurant[]>("deck")) ?? [];
    let next: { deck: Restaurant[]; paid: boolean; note?: string };
    if (mode === "same") {
      if (dealt.length === 0) {
        return this.send(ws, { type: "error", message: "nothing to vote on again. deal a new list." });
      }
      next = { deck: dealt, paid: false };
    } else {
      const fetched = await nextRoundDeck(
        {
          ...this.deckRequest(meta, new Set(dealt.map((r) => r.id))),
          vibeCounts: await vibeCounts(this.ctx.storage),
        },
        rounds < MAX_AGAIN_ROUNDS,
      );
      if ("error" in fetched) {
        await this.broadcastState(); // the radius may have moved even though the round did not
        return this.send(ws, { type: "error", message: fetched.error });
      }
      next = fetched;
    }
    const { deck, paid, note: searchNote } = next;

    await this.ctx.storage.delete("votes");
    await this.ctx.storage.delete("winner");
    if (paid) await this.ctx.storage.put("againRounds", rounds + 1);
    meta.status = "swiping";
    await this.ctx.storage.put("meta", meta);
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    this.broadcast({
      type: "deck",
      restaurants: deck,
      demo: await readDemoMode(this.ctx.storage),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
      ...(searchNote ? { searchNote } : {}),
    });
    await this.broadcastState();
    await this.evaluate(meta);
  }

  private deckRequest(meta: SessionMeta, exclude?: ReadonlySet<string>) {
    return { storage: this.ctx.storage, env: this.env, meta, exclude };
  }
  async deckFor(meta: SessionMeta): Promise<Restaurant[]> {
    return getOrCreateDeck({ ...this.deckRequest(meta), vibeCounts: await vibeCounts(this.ctx.storage) });
  }
  private connectedParticipants(exclude?: WebSocket): SocketAttachment[] {
    return attachmentsOn(this.ctx, exclude);
  }
  private send(ws: WebSocket, message: ServerMessage): void {
    sendTo(ws, message);
  }
  private broadcast(message: ServerMessage): void {
    broadcastTo(this.ctx, message);
  }
  private async broadcastHistory(code: string): Promise<void> {
    this.broadcast({ type: "history", visited: await visitedFor(this.env, code) });
  }
  private broadcastResult(
    result: DecisionResult | null,
    total: number,
    vetoedCount: number,
    round: number,
  ): void {
    broadcastTo(this.ctx, resultMessage(result, total, vetoedCount, round));
  }
  private async broadcastState(): Promise<void> {
    await broadcastSessionState(this.ctx);
  }
}
