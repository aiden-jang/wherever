// WebSocket message protocol. Every realtime message is one of these tagged
// unions. Client -> server and server -> client are kept separate so each side
// only handles what it should receive.

import type {
  Participant,
  Restaurant,
  Session,
  SwipeDirection,
  TastePulse,
  VisitedPlace,
} from "./types.js";
import type { DecisionAlternative } from "./decision.js";

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
  /** A super-like (weighted right-swipe). Server enforces one per participant per round. */
  super?: boolean;
  /**
   * A veto (absolute left-swipe): removes the place from contention whatever the majority wanted.
   * Server enforces one per participant per round — the client hiding a spent button is not a rule.
   */
  veto?: boolean;
}

/** Remove this participant's most recent local vote before the round is decided. */
export interface UndoSwipeMessage {
  type: "undo_swipe";
  restaurantId: string;
}

/** Host can end the round early and let the current tally decide. */
export interface DecideNowMessage {
  type: "decide_now";
}

/** Host starts a fresh round, excluding places the group already picked. */
export interface AgainMessage {
  type: "again";
}

/** Host promotes one of the ranked backups; all clients receive the same updated result. */
export interface ChooseAlternativeMessage {
  type: "choose_alternative";
  restaurantId: string;
}

export interface PlannedMeetup {
  start: string;
  duration: 60 | 90 | 120;
}

/** Host sets (or clears) the meetup time after a winner is chosen. */
export interface SetPlanMessage {
  type: "set_plan";
  planned: PlannedMeetup | null;
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
  | UndoSwipeMessage
  | DecideNowMessage
  | AgainMessage
  | ChooseAlternativeMessage
  | SetPlanMessage
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
  /** Whether this client already spent its one super-like this round (for resume after reconnect). */
  superUsed?: boolean;
  /** Whether this client already spent its one veto this round (for resume after reconnect). */
  vetoUsed?: boolean;
  /** Absolute epoch-ms deadline when the round auto-decides; omitted when there's no timer. */
  roundEndsAt?: number;
  /** True when this is the sample deck served because the monthly live-data budget is spent. */
  demo?: boolean;
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
  /**
   * Participant ids that have finished, sent ONLY when the host enabled revealVoters. Omitted
   * entirely in anonymous sessions so identities never leave the server.
   */
  finishedIds?: string[];
  /** Anonymous aggregate only: no restaurant, category, participant, or individual ballot. */
  tastePulse?: TastePulse;
}

export interface MatchMessage {
  type: "match";
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
  /** Ranked, non-vetoed fallbacks from the same anonymous tally. Optional for older rooms. */
  alternatives?: DecisionAlternative[];
  /** How many places somebody vetoed, so the winner doesn't look arbitrary. */
  vetoedCount?: number;
  /**
   * Which round finally decided it, 1-based. The group's indecision is the thing this app exists
   * to end, so the number of attempts it took is worth saying out loud.
   */
  round?: number;
}

/**
 * Round ended with no winner.
 *
 * `vetoedCount` separates the two ways that happens, which read completely differently to the group:
 * nobody wanted anything, or people wanted things and every one of them got vetoed. Saying "nobody
 * liked anything" in the second case is simply false, and it is the case where somebody most wants
 * to know what happened.
 */
export interface NoMatchMessage {
  type: "no_match";
  vetoedCount?: number;
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

/** Sent to a client right after it joins so it knows which participant it is — stable across
 *  reconnects and independent of display name (two people can share a name). */
export interface IdentityMessage {
  type: "identity";
  participantId: string;
}

/** A reaction someone threw, fanned out to the whole session. */
export interface ReactionMessage {
  type: "reaction";
  emoji: string;
  /** Display name of whoever sent it. */
  from: string;
}

/** The shared meetup time. Persisted so late joiners and reconnects see the same plan. */
export interface PlanMessage {
  type: "plan";
  planned: PlannedMeetup | null;
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
  | IdentityMessage
  | PlanMessage
  | ReactionMessage;
