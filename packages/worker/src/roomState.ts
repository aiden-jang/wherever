import type { SessionFilters, SessionStatus, VoteMode } from "@wherever/shared";

/*
 * The two shapes a room keeps: what it persists about the session, and what it hangs on each
 * socket. Split out so the deck helpers can read a session without importing the Durable Object.
 */

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
