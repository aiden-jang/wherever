import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { withViewTransition } from "./viewTransition.js";

/** Flush route updates inside the transition callback so its snapshot sees the new DOM.
 * Reduced motion and unsupported browsers use ordinary navigation. */
export function useTransitionNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to: string) => {
      withViewTransition(() => navigate(to));
    },
    [navigate],
  );
}
