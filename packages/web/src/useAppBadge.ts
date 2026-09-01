import { useEffect } from "react";

/**
 * The count on the installed app's icon.
 *
 * A group session spends most of its life waiting for one person, and that person has usually tabbed
 * away. A badge is the only thing this app can put in front of them without asking for notification
 * permission, which for a no-accounts dinner picker would be a big ask for a small favour.
 *
 * Only while the tab is hidden. A badge on an app you are looking at is telling you something you can
 * already see, and it lingers on the icon after you have dealt with it.
 *
 * Silently absent on iOS and Firefox. The whole feature degrades to nothing, which is the correct
 * amount of code to spend on a decoration.
 */
export function useAppBadge(count: number) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;

    const paint = () => {
      /* `void` on both: they reject when the app is not installed, which is the common case and not
         an error worth reporting. */
      if (document.hidden && count > 0) void nav.setAppBadge?.(count).catch(() => {});
      else void nav.clearAppBadge?.().catch(() => {});
    };

    paint();
    document.addEventListener("visibilitychange", paint);
    return () => {
      document.removeEventListener("visibilitychange", paint);
      void nav.clearAppBadge?.().catch(() => {});
    };
  }, [count]);
}
