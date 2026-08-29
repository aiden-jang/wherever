import { useCallback, useEffect, useState } from "react";
import { shouldOfferInstall } from "@wherever/shared";

/** Chrome's install event. Not in lib.dom, because it is not in any spec. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_KEY));

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Hold onto it: without preventDefault Chrome shows its own bar at its own moment.
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setEvent(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installed =
    typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true;

  const dismiss = useCallback(() => {
    writeFlag(DISMISSED_KEY);
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    // Either way this event is spent, and a declined prompt is a no.
    setEvent(null);
    dismiss();
  }, [event, dismiss]);

  return {
    offer: shouldOfferInstall({ browserOffered: event !== null, installed, dismissed, decidedRounds }),
    install,
    dismiss,
  };
}
