import { broadcastTo } from "./roomSockets.js";
import { rescheduleAlarm } from "./hostHandover.js";
import type { Restaurant, SessionFilters, SessionStatus, Vote, VoteMode } from "@wherever/shared";

/* Persisted room metadata and hibernation-safe socket attachments. */

export interface SessionMeta {
  code: string;
  status: SessionStatus;
  voteMode: VoteMode;
  filters: SessionFilters;
}

/** Who a returning browser is, so a refresh reclaims its seat rather than taking a new one. */
export type ClientMap = Record<string, { participantId: string; isHost: boolean }>;

/** Hung on the WebSocket, so a message can be attributed without a lookup. */
export interface SocketAttachment {
  participantId: string;
  displayName: string;
  isHost: boolean;
}

export function socketIdentity(ws: WebSocket): SocketAttachment | null {
  const attachment = ws.deserializeAttachment() as SocketAttachment | null;
  return attachment?.participantId ? attachment : null;
}

export async function isRoomHost(ctx: DurableObjectState, ws: WebSocket): Promise<boolean> {
  const identity = socketIdentity(ws);
  return identity !== null && identity.participantId === (await ctx.storage.get<string>("hostId"));
}

export type VoteMap = Record<string, Vote>;

export async function readVotes(storage: DurableObjectStorage): Promise<Vote[]> {
  const map = (await storage.get<VoteMap>("votes")) ?? {};
  return Object.values(map);
}

export async function readRoundNumber(storage: DurableObjectStorage): Promise<number> {
  return (await storage.get<number>("roundNumber")) ?? ((await storage.get<number>("againRounds")) ?? 0) + 1;
}

export async function turnOffTimer(ctx: DurableObjectState, roundId: number): Promise<void> {
  const storage = ctx.storage;
  if (roundId !== (await readRoundNumber(storage))) return;
  const deadline = await storage.get<number>("roundEndsAt");
  if (deadline === undefined || Date.now() >= deadline) return;
  await storage.delete("roundEndsAt");
  await rescheduleAlarm(ctx);
  broadcastTo(ctx, { type: "round_clock", roundEndsAt: null });
}

export async function roomForJoin(ctx: DurableObjectState): Promise<SessionMeta | undefined> {
  const storage = ctx.storage;
  const meta = await storage.get<SessionMeta>("meta");
  if (meta?.status !== "swiping" || (await storage.get<Restaurant[]>("deck"))?.length) return meta;
  // Earlier versions treated an empty first search as an untimed round.
  const lobby: SessionMeta = { ...meta, status: "lobby" };
  await storage.transaction(async (transaction) => {
    await transaction.put("meta", lobby);
    await transaction.delete(["deck", "votes", "roundEndsAt"]);
  });
  await rescheduleAlarm(ctx);
  return lobby;
}
