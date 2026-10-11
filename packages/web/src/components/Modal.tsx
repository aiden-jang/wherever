import { type ReactNode, useEffect } from "react";
import { useScrollLock } from "../useScrollLock";
import { useDialogFocus } from "../useDialogFocus";
import { useSwipeToDismiss } from "../useSwipeToDismiss";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Minimal centered modal: an X (top-right), backdrop click, Escape, and swipe-down all close it.
 *  Background scroll is locked while open. */
export function Modal({ title, onClose, children }: ModalProps) {
  useScrollLock();
  const { dragY, scrollRef, handlers } = useSwipeToDismiss(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Moves focus in on open, keeps Tab inside, and puts it back on the trigger on close.
  const focusPanel = useDialogFocus();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        ref={(el) => {
          scrollRef.current = el;
          focusPanel(el);
        }}
        tabIndex={-1}
        className="relative w-full max-w-sm max-h-[85dvh] overflow-y-auto overscroll-contain rounded-3xl bg-ink-soft border border-white/15 p-7 shadow-raised"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? "none" : "transform 0.2s ease",
        }}
        onClick={(e) => e.stopPropagation()}
        {...handlers}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-lg text-muted hover:bg-white/10 hover:text-cream transition-colors"
        >
          ✕
        </button>
        <h2 className="font-display text-3xl font-bold mb-6 pr-8">{title}</h2>
        {children}
      </div>
    </div>
  );
}
