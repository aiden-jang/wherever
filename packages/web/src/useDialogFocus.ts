import { useCallback, useLayoutEffect, useRef } from "react";

/* Trap focus across every visible control, including browsers whose default Tab skips buttons. Restore the trigger on close. */

/** Focusable and actually reachable. `offsetParent` is null for anything display:none. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialogFocus(): (el: HTMLElement | null) => void {
  const panel = useRef<HTMLElement | null>(null);

  // Read before the dialog paints, so it is the trigger rather than anything the dialog focused.
  const trigger = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );

  useLayoutEffect(() => {
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
      e.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next =
        index < 0
          ? e.shiftKey
            ? items.length - 1
            : 0
          : (index + (e.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next]!.focus();
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
