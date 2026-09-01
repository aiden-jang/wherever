import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";

/**
 * `navigate`, wrapped in a view transition where the browser has one.
 *
 * The moment worth animating is joining a room: the landing page's card fan and the deck you land on
 * are the same object at different sizes, and today the screen simply swaps. Giving both the same
 * `view-transition-name` lets the browser tween between them, which is the difference between a page
 * change and a thing moving.
 *
 * `startViewTransition` takes a callback and waits for the DOM to change inside it. React's updates
 * are asynchronous, so the callback resolves a frame before the new route has rendered and the
 * transition captures nothing. `flushSync` is the documented answer, and the reason this is a hook
 * rather than three lines at each call site.
 *
 * Absent in Firefox, and skipped whole under reduced motion, where a cross-fade is exactly the
 * unrequested movement that setting is asking not to see. Both fall through to a plain navigate.
 */
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
