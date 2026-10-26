import { flushSync } from "react-dom";

type Transition = { ready?: Promise<unknown>; finished?: Promise<unknown> };

/** Presentation failures must not discard navigation or a decision already received from the room. */
export function withViewTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition | undefined };
  if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  let applied = false;
  try {
    const transition = doc.startViewTransition(() => {
      applied = true;
      flushSync(update);
    });
    transition?.ready?.catch(() => {});
    transition?.finished?.catch(() => {});
  } catch {
    if (!applied) update();
  }
}
