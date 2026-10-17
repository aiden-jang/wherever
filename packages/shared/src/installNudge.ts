// Offer installation only after a completed round, when the visitor has used the app.

export interface InstallNudgeState {
  /** The browser offered a real install prompt. Safari never does, so this is often false. */
  browserOffered: boolean;
  /** Already running from the home screen, so there is nothing to install. */
  installed: boolean;
  /** They said no once. That is an answer. */
  dismissed: boolean;
  /** Rounds this browser has seen decide. */
  decidedRounds: number;
}

export function shouldOfferInstall(state: InstallNudgeState): boolean {
  if (!state.browserOffered || state.installed || state.dismissed) return false;
  return state.decidedRounds >= 1;
}
