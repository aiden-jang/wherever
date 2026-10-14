import type {
  DecisionAlternative,
  DemoReason,
  Restaurant,
  ServerMessage,
  Session,
  TastePulse,
  Vibe,
  VisitedPlace,
} from "@wherever/shared";

export interface Progress {
  finishedCount: number;
  totalParticipants: number;
  finishedIds?: string[];
  tastePulse?: TastePulse;
  votesCast?: number;
}
export type MatchState =
  | {
      kind: "match";
      restaurant: Restaurant;
      rightSwipes: number;
      alternatives: DecisionAlternative[];
      totalParticipants: number;
      vetoedCount: number;
      tiedWith: number;
      vetoedTop: boolean;
      superTipped: boolean;
      round: number;
    }
  | { kind: "none"; vetoedCount: number }
  | null;
export interface FloatingReaction {
  id: string;
  emoji: string;
  from: string;
  fromId?: string;
  kind?: "veto" | "super";
}
export interface SessionState {
  session: Session | null;
  deck: Restaurant[] | null;
  demo: DemoReason | null;
  alreadyVoted: string[];
  superUsed: boolean;
  deckNote: string | null;
  behindBy: number;
  nudges: number;
  vetoUsed: boolean;
  roundEndsAt: number | null;
  progress: Progress | null;
  match: MatchState;
  vibeCounts: Partial<Record<Vibe, number>>;
  myVibe: Vibe | null;
  visited: VisitedPlace[];
  error: string | null;
  errorSeq: number;
  status: "connecting" | "open" | "closed";
  everConnected: boolean;
  participantId: string | null;
  reactions: FloatingReaction[];
}
export const initialSessionState: SessionState = {
  session: null,
  deck: null,
  demo: null,
  alreadyVoted: [],
  superUsed: false,
  deckNote: null,
  behindBy: 0,
  nudges: 0,
  vetoUsed: false,
  roundEndsAt: null,
  progress: null,
  match: null,
  vibeCounts: {},
  myVibe: null,
  visited: [],
  error: null,
  errorSeq: 0,
  status: "connecting",
  everConnected: false,
  participantId: null,
  reactions: [],
};
type Action =
  | { type: "reset" }
  | { type: "connection"; status: SessionState["status"] }
  | { type: "expire_reaction"; id: string }
  | { type: "received"; message: ServerMessage; reactionId?: string };

/** A deck replaces all round-local state atomically; identities and history belong to the room. */
export function sessionReducer(state: SessionState, action: Action): SessionState {
  if (action.type === "reset") return initialSessionState;
  if (action.type === "connection")
    return {
      ...state,
      status: action.status,
      everConnected: state.everConnected || action.status === "open",
    };
  if (action.type === "expire_reaction")
    return { ...state, reactions: state.reactions.filter((r) => r.id !== action.id) };
  const msg = action.message;
  switch (msg.type) {
    case "session_state":
      return { ...state, session: msg.session };
    case "deck":
      return {
        ...state,
        match: null,
        progress: null,
        deck: msg.restaurants,
        demo: msg.demo ?? null,
        deckNote: [msg.vibeEffect, msg.searchNote].filter(Boolean).join(" ") || null,
        behindBy: msg.behindBy ?? 0,
        superUsed: msg.superUsed ?? false,
        vetoUsed: msg.vetoUsed ?? false,
        roundEndsAt: msg.roundEndsAt ?? null,
        alreadyVoted: msg.alreadyVoted ?? [],
        error: null,
        reactions: [],
      };
    case "vote_progress":
      return {
        ...state,
        progress: {
          finishedCount: msg.finishedCount,
          totalParticipants: msg.totalParticipants,
          finishedIds: msg.finishedIds,
          tastePulse: msg.tastePulse,
          votesCast: msg.votesCast,
        },
      };
    case "match":
      return {
        ...state,
        match: {
          kind: "match",
          restaurant: msg.restaurant,
          rightSwipes: msg.rightSwipes,
          alternatives: msg.alternatives ?? [],
          totalParticipants: msg.totalParticipants,
          vetoedCount: msg.vetoedCount ?? 0,
          tiedWith: msg.tiedWith ?? 0,
          vetoedTop: msg.vetoedTop ?? false,
          superTipped: msg.superTipped ?? false,
          round: msg.round ?? 1,
        },
      };
    case "nudge":
      return { ...state, nudges: state.nudges + 1 };
    case "no_match":
      return { ...state, match: { kind: "none", vetoedCount: msg.vetoedCount ?? 0 } };
    case "history":
      return { ...state, visited: msg.visited };
    case "vibes":
      return { ...state, vibeCounts: msg.counts, myVibe: msg.yours };
    case "reaction":
      return {
        ...state,
        reactions: [
          ...state.reactions,
          {
            id: action.reactionId!,
            emoji: msg.emoji,
            from: msg.from,
            ...(msg.fromId ? { fromId: msg.fromId } : {}),
            ...(msg.kind ? { kind: msg.kind } : {}),
          },
        ],
      };
    case "identity":
      return { ...state, participantId: msg.participantId };
    case "error":
      return { ...state, error: msg.message, errorSeq: state.errorSeq + 1 };
    default:
      return state;
  }
}
