import { useCallback, useState, useSyncExternalStore } from "react";
import { shouldOfferInstall } from "@wherever/shared";

/** Chrome's install event. Not in lib.dom, because it is not in any spec. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let captured: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => captured;

function setCaptured(event: InstallPromptEvent | null) {
  captured = event;
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    setCaptured(event as InstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => setCaptured(null));
}

const DISMISSED_KEY = "wherever:install-dismissed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    // Private mode. Treat it as "not dismissed": the worst case is being asked twice.
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* nothing to remember it with */
  }
}

/**
 * Offer to install, but only after a round has decided something.
 *
 * `decidedRounds` is passed in rather than counted here, because the reason to install is the round
 * that just finished, and this hook has no idea one happened.
 */
export function useInstallPrompt(decidedRounds: number): {
  offer: boolean;
  install: () => Promise<void>;
  dismiss: () => void;
} {
  const event = useSyncExternalStore(subscribe, snapshot);
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_KEY));

  const installed =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true;

  const dismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY);
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    setCaptured(null);
    try {
      await event.prompt();
      await event.userChoice;
      dismiss();
    } catch {
      // The browser can revoke a previously offered prompt.
    }
  }, [event, dismiss]);

  return {
    offer: shouldOfferInstall({ browserOffered: event !== null, installed, dismissed, decidedRounds }),
    install,
    dismiss,
  };
}
