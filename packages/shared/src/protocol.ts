// WebSocket message protocol. Every realtime message is one of these tagged
// unions. Client -> server and server -> client are kept separate so each side
// only handles what it should receive.

import type {
  Participant,
  Restaurant,
  Session,
  SwipeDirection,
} from "./types.js";

// ---- Client -> Server ----

export interface JoinMessage {
  type: "join";
  code: string;
  displayName: string;
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

export type ClientMessage =
  | JoinMessage
  | StartRoundMessage
  | SwipeMessage
  | DecideNowMessage;

// ---- Server -> Client ----

export interface SessionStateMessage {
  type: "session_state";
  session: Session;
}

export interface DeckMessage {
  type: "deck";
  restaurants: Restaurant[];
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

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type ServerMessage =
  | SessionStateMessage
  | DeckMessage
  | ParticipantJoinedMessage
  | VoteProgressMessage
  | MatchMessage
  | ErrorMessage;
