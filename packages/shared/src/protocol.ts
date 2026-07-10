// WebSocket message protocol. Every realtime message is one of these tagged
// unions. Client -> server and server -> client are kept separate so each side
// only handles what it should receive.

import type {
  Participant,
  Restaurant,
  Session,
  SwipeDirection,
  VisitedPlace,
} from "./types.js";

// ---- Client -> Server ----

export interface JoinMessage {
  type: "join";
  code: string;
  displayName: string;
  /** Stable per-session id so a reconnecting client keeps its identity + votes. */
  clientId?: string;
}

export interface StartRoundMessage {
  type: "start_round";
}

export interface SwipeMessage {
  type: "swipe";
  restaurantId: string;
  direction: SwipeDirection;
}

/** Host can end the round early and let the current tally decide. */
export interface DecideNowMessage {
  type: "decide_now";
}

/** Host starts a fresh round, excluding places the group already picked. */
export interface AgainMessage {
  type: "again";
}

/** Throw an emoji reaction to everyone in the session. Ephemeral, not persisted. */
export interface ReactMessage {
  type: "react";
  emoji: string;
}

export type ClientMessage =
  | JoinMessage
  | StartRoundMessage
  | SwipeMessage
  | DecideNowMessage
  | AgainMessage
  | ReactMessage;

// ---- Server -> Client ----

export interface SessionStateMessage {
  type: "session_state";
  session: Session;
}

export interface DeckMessage {
  type: "deck";
  restaurants: Restaurant[];
  /** Restaurant ids this client already voted on, for resume after reconnect. */
  alreadyVoted?: string[];
}

export interface ParticipantJoinedMessage {
  type: "participant_joined";
  participant: Participant;
}

export interface VoteProgressMessage {
  type: "vote_progress";
  /** How many participants have finished swiping the whole deck. */
  finishedCount: number;
  totalParticipants: number;
}

export interface MatchMessage {
  type: "match";
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
}

/** Round ended with nobody swiping right on anything. */
export interface NoMatchMessage {
  type: "no_match";
}

/** Places this group has already landed on, excluded from future decks. */
export interface HistoryMessage {
  type: "history";
  visited: VisitedPlace[];
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

/** A reaction someone threw, fanned out to the whole session. */
export interface ReactionMessage {
  type: "reaction";
  emoji: string;
  /** Display name of whoever sent it. */
  from: string;
}

export type ServerMessage =
  | SessionStateMessage
  | DeckMessage
  | ParticipantJoinedMessage
  | VoteProgressMessage
  | MatchMessage
  | NoMatchMessage
  | HistoryMessage
  | ErrorMessage
  | ReactionMessage;
