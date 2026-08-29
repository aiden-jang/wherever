/*
 * Whether to ask somebody to install the app.
 *
 * Asking on arrival is the thing everybody hates, and it is also the worst moment to ask: nobody
 * installs an app they have not used yet. So the only time this is allowed to appear is after a
 * round has actually decided something, when there is a reason to say out loud.
 */

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
