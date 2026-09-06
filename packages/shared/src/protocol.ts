// Every realtime message is one of these tagged unions. The two directions are separate types so
// each side can only handle what it should receive.

import type {
  Participant,
  Restaurant,
  Session,
  SessionFilters,
  SwipeDirection,
  TastePulse,
  VisitedPlace,
} from "./types.js";
import type { DecisionAlternative } from "./decision.js";
import type { Vibe } from "./vibes.js";

// ---- Client -> Server ----

/** Why a deck is stand-in data. `budget` is the month's Google spend; `sample` is no live source. */
export type DemoReason = "budget" | "sample";

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
  /** Kills the place whatever the majority wanted. One per person per round, enforced by the server:
   *  a client hiding a spent button is not a rule. */
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

/**
 * Host runs the round again, either way.
 *
 * `new` fetches places the group has not seen, which costs a Places search and counts against the
 * per-session cap. `same` re-deals the deck already in hand: free, uncapped, and the honest answer
 * to "we picked wrong", where the group wants another go at the list rather than a different list.
 * Optional and defaulting to `new`, so a client on the previous bundle still means what it used to.
 */
export interface AgainMessage {
  type: "again";
  deck?: "new" | "same";
}

/** Host promotes one of the ranked backups; all clients receive the same updated result. */
export interface ChooseAlternativeMessage {
  type: "choose_alternative";
  restaurantId: string;
}

/** Lobby only. A vibe changes the deck about to be dealt, so mid-round it would put two people on
 *  different sets of restaurants. `null` clears your pick. */
export interface SetVibeMessage {
  type: "set_vibe";
  vibe: Vibe | null;
}

/** Host only, lobby only. Mid-round would mean two people swiping different decks. */
export interface SetFiltersMessage {
  type: "set_filters";
  filters: SessionFilters;
}

/** Any seat may set this, not just the host: a place one person cannot eat at is a place the group
 *  cannot go, and asking them to say why out loud is the thing this avoids. */
export interface SetNeverAgainMessage {
  type: "set_never_again";
  restaurantId: string;
  neverAgain: boolean;
}

/** Throw an emoji reaction to everyone in the session. Ephemeral, not persisted. */
export interface ReactMessage {
  type: "react";
  emoji: string;
}

/** Host only: prod whoever has not finished the deck. */
export interface NudgeThemMessage {
  type: "nudge_them";
}

export type ClientMessage =
  | JoinMessage
  | StartRoundMessage
  | SwipeMessage
  | UndoSwipeMessage
  | DecideNowMessage
  | AgainMessage
  | ChooseAlternativeMessage
  | SetVibeMessage
  | SetFiltersMessage
  | SetNeverAgainMessage
  | ReactMessage
  | NudgeThemMessage;

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
  /** Why these are stand-ins, or absent when they are real. A reason, not a flag: the banner has two
   *  true things it could say, and a boolean made it guess. */
  demo?: DemoReason;
  /** Cards the furthest-along person is ahead of you. Only sent to the person it describes. */
  behindBy?: number;
  /** What the vibe did to the filters, in words. Worked out here because the vibe is folded into the
   *  filters before the deck is fetched, so by the time anyone looks the before-state is gone. */
  vibeEffect?: string;
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
  /** Sent only when the host turned on `revealVoters`. Omitted entirely otherwise, so in an anonymous
   *  round no identity ever leaves the server. */
  finishedIds?: string[];
  /** Anonymous aggregate only: no restaurant, category, participant, or individual ballot. */
  tastePulse?: TastePulse;
  /** A count and nothing else, so it says nothing about who voted or on what. Unlike `finishedCount`
   *  it moves on every swipe, which is the only continuous proof somebody else is in there with you. */
  votesCast?: number;
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
  /** How many places finished level with the winner. Optional for older rooms. */
  tiedWith?: number;
  /** A vetoed place outscored the winner. A flag, never a name: the veto stays anonymous. */
  vetoedTop?: boolean;
  /** Which round decided it, 1-based. Worth saying out loud: how many tries it took is the thing this
   *  app exists to shorten. */
  round?: number;
}

/*
 * Round ended with no winner.
 *
 * `vetoedCount` separates the two ways that happens, which read completely differently: nobody wanted
 * anything, or people wanted things and every one got vetoed. "Nobody liked anything" is simply false
 * in the second case, and that is the case where somebody most wants to know what happened.
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

/*
 * The host asking whoever has not finished to get on with it.
 *
 * Server-side, because working out who is unfinished needs to know who everybody is - exactly what an
 * anonymous round never sends. Delivered only to the people it is about.
 */
export interface NudgeMessage {
  type: "nudge";
}

/** A reaction someone threw, fanned out to the whole session. */
export interface ReactionMessage {
  type: "reaction";
  emoji: string;
  /** Display name of whoever sent it. Always empty for a `kind`, which is a vote, not chatter. */
  from: string;
  /**
   * Stable participant id of the sender, for anything that has to tell two people apart. Names
   * cannot: the app already identifies you by id everywhere else precisely because two people in a
   * session can both be called Sam. Absent on the anonymous system events.
   */
  fromId?: string;
  /**
   * Set when this is a consequence rather than someone tapping an emoji. A veto takes a place away
   * from the whole group and a super-like weighs the tally, so neither should drift up looking like
   * a laughing face. Never says who: both are votes, and votes here are anonymous.
   */
  kind?: "veto" | "super";
}

/**
 * How the group is feeling, as tallies and nothing else.
 *
 * Deliberately not a map of participant to vibe. Admitting to "fancy" in a group of five is a mildly
 * embarrassing thing, and an app that names you gets one honest round followed by four rounds of people
 * picking what they think everyone else wants. The server never sends the map, so no client can leak it,
 * which is the same rule swipes already follow.
 */
export interface VibesMessage {
  type: "vibes";
  counts: Partial<Record<Vibe, number>>;
  /** This client's own pick, so the picker can show it selected after a reconnect. */
  yours: Vibe | null;
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
  | VibesMessage
  | ReactionMessage
  | NudgeMessage;
