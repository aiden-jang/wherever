import { useCallback, useEffect, useRef } from "react";

/*
 * Keep the keyboard inside an open dialog, and put it back where it was on close.
 *
 * Both overlays declared `role="dialog"` and one of them declared `aria-modal="true"`, which tells a
 * screen reader the rest of the page is inert. Nothing made that true: focus stayed on the button
 * behind the overlay, so opening one and pressing Tab walked through the whole page underneath while
 * the overlay covered it. Escape and a backdrop click were the only ways out that worked.
 */

/** Focusable and actually reachable. `offsetParent` is null for anything display:none. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialogFocus(): (el: HTMLElement | null) => void {
  const panel = useRef<HTMLElement | null>(null);

  // Read before the dialog paints, so it is the trigger rather than anything the dialog focused.
  const trigger = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    const restoreTo = trigger.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        // Nothing to land on: hold focus on the panel rather than letting Tab escape behind it.
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      // Wrap at both ends, and catch the case where focus is still outside the dialog entirely.
      if (!panel.current.contains(active as Node)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreTo?.focus?.();
    };
  }, []);

  return useCallback((el: HTMLElement | null) => {
    panel.current = el;
    if (!el || el.contains(document.activeElement)) return;
    const first = el.querySelector<HTMLElement>(FOCUSABLE);
    // The panel itself is the fallback, which is why callers give it tabIndex={-1}.
    (first ?? el).focus({ preventScroll: true });
  }, []);
}
