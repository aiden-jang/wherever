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

/** Hung on the WebSocket, so a message can be attributed without a lookup. */
export interface SocketAttachment {
  participantId: string;
  displayName: string;
  isHost: boolean;
}
