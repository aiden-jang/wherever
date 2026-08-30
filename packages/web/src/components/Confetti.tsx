import { useMemo } from "react";

// Read from the theme rather than repeated here, so a palette change reaches the confetti too.
const COLORS = [
  "var(--color-ember)",
  "var(--color-flare)",
  "var(--color-grape)",
  "var(--color-acid)",
  "var(--color-flame)",
];

/**
 * Lightweight CSS confetti for the match celebration. Pure divs + a keyframe (no dependency,
 * no canvas). Pieces are computed once so re-renders don't reshuffle them mid-fall. Hidden
 * under prefers-reduced-motion via the .confetti-piece rule.
 */
export function Confetti({ count = 40 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        width: 6 + Math.random() * 8,
        height: 8 + Math.random() * 10,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
