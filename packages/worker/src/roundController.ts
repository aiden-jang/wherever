import {
  decideWinner,
  finishedParticipantIds,
  promoteAlternative,
  tastePulse,
  vetoedRestaurantIds,
  type DecisionResult,
  type Restaurant,
  type SwipeDirection,
  type SessionStatus,
} from "@wherever/shared";
import type { Env } from "./env.js";
import type { SessionMeta, VoteMap } from "./roomState.js";
import { isRoomHost, readRoundNumber, readVotes } from "./roomState.js";
import { writeEvent } from "./events.js";
import { rescheduleAlarm } from "./hostHandover.js";
import { vibeCounts } from "./vibeTally.js";
import { attachmentsOn, broadcastSessionState, broadcastTo, resultMessage, sendTo } from "./roomSockets.js";
import {
  fetchFreshDeck,
  nextRoundDeck,
  readDeck,
  presentHistory,
  readDemoMode,
  recordVisit,
  visitedFor,
} from "./deckSource.js";
import { RoomPlaces, storedPlace, storedVerdict } from "./roomPlaces.js";
import { assertRoomLive, ExpiredRoomError, putLive } from "./sessionRetention.js";

import { changeBallot } from "./roomBallot.js";
import { returningSeats } from "./hostHandover.js";

const MAX_AGAIN_ROUNDS = 20;

export class RoundController {
  transitioning = false;
  readonly places: RoomPlaces;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.places = new RoomPlaces(env);
  }
  private async setRoundDeadline(meta: SessionMeta): Promise<number | undefined> {
    const secs = meta.filters.roundSeconds ?? 0;
    if (secs > 0) {
      const deadline = Date.now() + secs * 1000;
      await putLive(this.ctx.storage, { roundEndsAt: deadline });
      await rescheduleAlarm(this.ctx);
      return deadline;
    }
    await this.ctx.storage.delete("roundEndsAt");
    await rescheduleAlarm(this.ctx);
    return undefined;
  }

  async handleStartRound(ws: WebSocket): Promise<void> {
    await this.transition(ws, () => this.startRound(ws));
  }

  async handleAgain(ws: WebSocket, mode: "new" | "same"): Promise<void> {
    await this.transition(ws, () => this.again(ws, mode));
  }

  private async transition(ws: WebSocket, run: () => Promise<void>): Promise<void> {
    if (this.transitioning) return sendTo(ws, { type: "error", message: "The deal is already in progress." });
    this.transitioning = true;
    try {
      await run();
    } finally {
      this.transitioning = false;
    }
  }

  private async startRound(ws: WebSocket): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) {
      return sendTo(ws, {
        type: "error",
        message: "Only the host can start swiping.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;

    let deck: Restaurant[];
    try {
      deck = await fetchFreshDeck({
        ...this.deckRequest(meta),
        vibeCounts: await vibeCounts(this.ctx.storage),
      });
    } catch (error) {
      if (error instanceof ExpiredRoomError) throw error;
      console.error("restaurant_deck_failed", error);
      return sendTo(ws, {
        type: "error",
        message: "couldn't load restaurants right now. give it a moment and try again.",
      });
    }

    if (deck.length === 0) {
      return sendTo(ws, {
        type: "error",
        message: "No places matched. Widen the distance or remove a filter, then start again.",
      });
    }
    const roundNumber = await this.ctx.storage.get<number>("roundNumber");
    meta.status = "swiping";
    await putLive(this.ctx.storage, {
      meta,
      roundNumber: (roundNumber ?? 0) + 1,
      votes: {},
      winner: null,
      returnGrace: {},
    });
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    broadcastTo(this.ctx, {
      type: "deck",
      roundId: await readRoundNumber(this.ctx.storage),
      restaurants: deck,
      demo: await readDemoMode(this.ctx.storage),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
    });
    await broadcastSessionState(this.ctx);
    await this.evaluate(meta);
  }

  async handleSwipe(
    ws: WebSocket,
    restaurantId: string,
    direction: SwipeDirection,
    superLike: boolean,
    veto: boolean,
    roundId?: number,
    choiceId?: string,
  ): Promise<void> {
    const update = await changeBallot(this.ctx, ws, restaurantId, roundId, {
      direction,
      choiceId,
      super: superLike,
      veto,
    });
    if (update?.super) writeEvent(this.env, "super_like_used");
    if (update?.meta) await this.evaluate(update.meta);
  }

  async handleUndoSwipe(
    ws: WebSocket,
    restaurantId: string,
    roundId?: number,
    choiceId?: string | null,
  ): Promise<void> {
    const update = await changeBallot(this.ctx, ws, restaurantId, roundId, undefined, choiceId);
    if (update?.meta) await this.evaluate(update.meta);
  }

  async handleDecideNow(ws: WebSocket): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) {
      return sendTo(ws, {
        type: "error",
        message: "Only the host can call it.",
      });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "swiping") return;
    await this.decide(meta);
  }

  async editSearch(ws: WebSocket): Promise<void> {
    await this.transition(ws, async () => {
      if (!(await isRoomHost(this.ctx, ws))) return;
      const meta = await this.ctx.storage.get<SessionMeta>("meta");
      if (meta?.status !== "decided") return;
      const roundNumber = await readRoundNumber(this.ctx.storage);
      await putLive(this.ctx.storage, {
        meta: { ...meta, status: "lobby" },
        roundNumber,
        reserve: [],
        seenIds: [],
        lastSearchRadius: null,
      });
      await broadcastSessionState(this.ctx);
    });
  }

  async handleChooseAlternative(ws: WebSocket, restaurantId: string): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) {
      return sendTo(ws, { type: "error", message: "Only the host can switch the final pick." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    const result = await this.ctx.storage.get<DecisionResult | null>("winner");
    if (!meta || meta.status !== "decided" || !result) return;

    const promoted = promoteAlternative(result, restaurantId);
    if (!promoted) {
      return sendTo(ws, { type: "error", message: "That place is no longer a finalist." });
    }

    const round = await readRoundNumber(this.ctx.storage);
    await putLive(this.ctx.storage, { winner: storedVerdict(promoted) });
    const votes = await readVotes(this.ctx.storage);
    const [restaurantResult, total, demo] = await Promise.all([
      this.places.showVerdict(promoted, meta.filters),
      this.ctx.storage.get<number>("verdictTotal"),
      readDemoMode(this.ctx.storage),
    ]);
    const winner = await this.ctx.storage.get<DecisionResult>("winner");
    if (!(await this.isCurrentRound(round, "decided")) || winner?.restaurant.id !== restaurantId) return;
    broadcastTo(
      this.ctx,
      resultMessage(
        restaurantResult,
        total ?? attachmentsOn(this.ctx).length,
        vetoedRestaurantIds(votes).size,
        round,
        demo,
      ),
    );
    await recordVisit(
      this.env,
      meta.code,
      promoted.restaurant.id,
      promoted.restaurant.source === "google" ? "" : promoted.restaurant.name,
    );
    await this.broadcastHistory(meta.code);
  }

  async evaluate(meta: SessionMeta, excludeWs?: WebSocket): Promise<void> {
    const deck = await readDeck(this.ctx.storage);
    const votes = await readVotes(this.ctx.storage);
    const participants = attachmentsOn(this.ctx, excludeWs);
    const ids = participants.map((p) => p.participantId);
    const returning = await returningSeats(this.ctx.storage);
    const eligible = [...new Set([...ids, ...returning])];
    const total = eligible.length;
    const finishedIds = finishedParticipantIds(votes, eligible, deck.length);
    const pulse =
      total >= 3 && deck.every((place) => place.source !== "google") ? tastePulse(deck, votes) : null;

    broadcastTo(this.ctx, {
      type: "vote_progress",
      finishedCount: finishedIds.length,
      totalParticipants: total,
      votesCast: votes.length,
      ...(pulse ? { tastePulse: pulse } : {}),
      ...(meta.filters.revealVoters ? { finishedIds } : {}),
    });

    if (ids.length > 0 && finishedIds.length >= total) {
      await this.decide(meta);
    }
  }

  async decide(meta: SessionMeta): Promise<void> {
    const storage = this.ctx.storage;
    const participants = attachmentsOn(this.ctx);
    const verdict = await storage.transaction(async (transaction) => {
      const current = await transaction.get<SessionMeta>("meta");
      if (current?.status !== "swiping") return null;
      await assertRoomLive(transaction);
      const deck = (await transaction.get<Restaurant[]>("deck")) ?? [];
      const votes = Object.values((await transaction.get<VoteMap>("votes")) ?? {});
      const total = new Set([
        ...votes.map((vote) => vote.participantId),
        ...participants.map((p) => p.participantId),
      ]).size;
      const result = decideWinner(deck, votes);
      await transaction.put({
        meta: { ...current, status: "decided" },
        winner: result ? storedVerdict(result) : null,
        verdictTotal: total,
      });
      await transaction.delete("roundEndsAt");
      return { result, total, votes, round: await readRoundNumber(transaction) };
    });
    if (!verdict) return;
    const { result, total, votes, round } = verdict;
    writeEvent(this.env, "session_decided", "", "", total);
    await rescheduleAlarm(this.ctx);

    await broadcastSessionState(this.ctx);
    const [displayResult, demo] = await Promise.all([
      result ? this.places.showVerdict(result, meta.filters) : null,
      readDemoMode(this.ctx.storage),
    ]);
    if (!(await this.isCurrentRound(round, "decided"))) return;
    const winner = await storage.get<DecisionResult>("winner");
    if (winner?.hostPicked) return;
    broadcastTo(this.ctx, resultMessage(displayResult, total, vetoedRestaurantIds(votes).size, round, demo));
    if (result)
      await recordVisit(
        this.env,
        meta.code,
        result.restaurant.id,
        result.restaurant.source === "google" ? "" : result.restaurant.name,
      );
    await this.broadcastHistory(meta.code);
  }

  private async again(ws: WebSocket, mode: "new" | "same"): Promise<void> {
    if (!(await isRoomHost(this.ctx, ws))) {
      return sendTo(ws, { type: "error", message: "Only the host can run it back." });
    }
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    if (!meta || meta.status !== "decided") return;

    const rounds = (await this.ctx.storage.get<number>("againRounds")) ?? 0;
    const dealt = (await this.ctx.storage.get<Restaurant[]>("deck")) ?? [];
    let next: { deck: Restaurant[]; paid: boolean; note?: string };
    if (mode === "same") {
      if (dealt.length === 0) {
        return sendTo(ws, { type: "error", message: "nothing to vote on again. deal a new list." });
      }
      const history = await visitedFor(this.env, meta.code);
      const excluded = new Set(
        history.filter((place) => place.neverAgain).map((place) => place.restaurantId),
      );
      const deck = await this.places.showDeck(
        dealt.filter((place) => !excluded.has(place.id)),
        meta.filters,
      );
      if (!deck.length)
        return sendTo(ws, {
          type: "error",
          message: "Every place in this deck is excluded. Try new places.",
        });
      next = { deck, paid: false };
    } else {
      const fetched = await nextRoundDeck(
        {
          ...this.deckRequest(meta, new Set(dealt.map((r) => r.id))),
          vibeCounts: await vibeCounts(this.ctx.storage),
        },
        rounds < MAX_AGAIN_ROUNDS,
      );
      if ("error" in fetched) {
        return sendTo(ws, { type: "error", message: fetched.error });
      }
      next = fetched;
    }
    const { deck, paid, note: searchNote } = next;

    const roundNumber = ((await this.ctx.storage.get<number>("roundNumber")) ?? rounds + 1) + 1;
    await putLive(this.ctx.storage, {
      deck: deck.map(storedPlace),
      roundNumber,
      votes: {},
      winner: null,
      returnGrace: {},
      meta: { ...meta, status: "swiping" },
      ...(paid ? { againRounds: rounds + 1 } : {}),
    });
    meta.status = "swiping";
    const roundEndsAt = await this.setRoundDeadline(meta);
    const vibeEffect = await this.ctx.storage.get<string>("vibeEffect");
    broadcastTo(this.ctx, {
      type: "deck",
      roundId: await readRoundNumber(this.ctx.storage),
      restaurants: deck,
      demo: await readDemoMode(this.ctx.storage),
      roundEndsAt,
      ...(vibeEffect ? { vibeEffect } : {}),
      ...(searchNote ? { searchNote } : {}),
    });
    await broadcastSessionState(this.ctx);
    await this.evaluate(meta);
  }

  private async isCurrentRound(round: number, status: SessionStatus): Promise<boolean> {
    const meta = await this.ctx.storage.get<SessionMeta>("meta");
    return meta?.status === status && (await readRoundNumber(this.ctx.storage)) === round;
  }

  private deckRequest(meta: SessionMeta, exclude?: ReadonlySet<string>) {
    return { storage: this.ctx.storage, env: this.env, meta, exclude, places: this.places };
  }
  private async broadcastHistory(code: string): Promise<void> {
    broadcastTo(this.ctx, { type: "history", visited: await presentHistory(this.env, code, this.places) });
  }
}
