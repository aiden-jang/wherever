import { useEffect } from "react";

/** Badge hidden tabs only and clear it on return. Unsupported browsers omit the decoration. */
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
