import type { ReactNode } from "react";
export const segBase = "flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors border min-h-11";
export const segOn = "bg-ember text-ink border-ember";
export const segOff = "bg-black/40 text-cream border-white/10 hover:border-white/30";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}
