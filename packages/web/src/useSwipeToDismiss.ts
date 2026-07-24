import { useRef, useState, type TouchEvent } from "react";

/** Drag-to-dismiss for a modal/sheet. Attach `handlers` to the panel and `scrollRef` to the
 *  scrollable content. A downward drag only starts when that content is scrolled to the top, so
 *  mid-content the panel scrolls normally; past `THRESHOLD` on release it closes, else it snaps back.
 *  `dragY` is the current downward offset — feed it into the panel's transform. */
const THRESHOLD = 90;

export function useSwipeToDismiss(onClose: () => void) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    // Only begin a dismiss-drag from the very top of the scroll area; otherwise let it scroll.
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    // Downward only. An upward move means they want to scroll the content — bail out of the drag.
    if (dy > 0) setDragY(dy);
    else {
      startY.current = null;
      setDragY(0);
    }
  };
  const onTouchEnd = () => {
    if (startY.current !== null && dragY > THRESHOLD) onClose();
    startY.current = null;
    setDragY(0);
  };

  return {
    dragY,
    scrollRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
