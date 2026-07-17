import { type ReactNode, useEffect } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Minimal centered modal: backdrop click and Escape both close it. */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Return focus to whatever opened the modal (the trigger button) when it closes, so keyboard and
  // screen-reader users aren't dumped at the top of the page.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => trigger?.focus?.();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-3xl bg-ink-soft border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="font-display text-2xl font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
