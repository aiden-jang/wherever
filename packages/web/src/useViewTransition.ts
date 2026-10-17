import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";

/** Flush route updates inside the transition callback so its snapshot sees the new DOM.
 * Reduced motion and unsupported browsers use ordinary navigation. */
export function useTransitionNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to: string) => {
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!doc.startViewTransition || still) {
        navigate(to);
        return;
      }
      doc.startViewTransition(() => flushSync(() => navigate(to)));
    },
    [navigate],
  );
}
