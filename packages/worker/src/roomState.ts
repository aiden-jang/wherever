import type { SessionFilters, SessionStatus, Vote, VoteMode } from "@wherever/shared";

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

export type VoteMap = Record<string, Vote>;

export async function readVotes(storage: DurableObjectStorage): Promise<Vote[]> {
  const map = (await storage.get<VoteMap>("votes")) ?? {};
  return Object.values(map);
}
