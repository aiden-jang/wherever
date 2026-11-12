export interface UndoState {
  roundId: number;
  blocked: string[];
}

export function undoBlocked(state: UndoState | undefined, roundId: number): string[] {
  return state?.roundId === roundId ? state.blocked : [];
}
