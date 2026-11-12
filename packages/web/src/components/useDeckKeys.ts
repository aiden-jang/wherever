import { useEffect, useLayoutEffect, useRef } from "react";
import type { SwipeDirection } from "@wherever/shared";

export function useDeckKeys({
  disabled,
  detailOpen,
  canUndo,
  superUsed,
  vetoUsed,
  commit,
  undoLast,
}: {
  disabled: boolean;
  detailOpen: boolean;
  canUndo: boolean;
  superUsed: boolean;
  vetoUsed: boolean;
  commit: (direction: SwipeDirection, superLike?: boolean, veto?: boolean) => void;
  undoLast: () => void;
}) {
  const handler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useLayoutEffect(() => {
    handler.current = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const main = target?.closest("#main-content");
      if (
        disabled ||
        detailOpen ||
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !main ||
        target?.closest(
          'input, textarea, select, button:not([data-deck-control]), a, [contenteditable]:not([contenteditable="false"]), [data-card-info]',
        ) ||
        window.getSelection()?.isCollapsed === false
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() !== "z") return;
      if (
        event.key === "Backspace" ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z")
      ) {
        if (canUndo) {
          event.preventDefault();
          undoLast();
        }
        return;
      }
      const action =
        event.key === "ArrowLeft"
          ? "left"
          : event.key === "ArrowRight"
            ? "right"
            : event.key === "ArrowUp" && !superUsed
              ? "super"
              : event.key.toLowerCase() === "v" && !vetoUsed
                ? "veto"
                : null;
      if (!action) return;
      event.preventDefault();
      main.querySelector<HTMLButtonElement>(`[data-vote-action="${action}"]`)?.focus({ preventScroll: true });
      commit(
        action === "left" || action === "veto" ? "left" : "right",
        action === "super",
        action === "veto",
      );
    };
  }, [canUndo, commit, detailOpen, disabled, superUsed, undoLast, vetoUsed]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handler.current(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
