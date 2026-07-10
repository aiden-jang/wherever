import { useMemo } from "react";

const COLORS = ["#ff5e2c", "#ff2d78", "#7c3aed", "#d7ff3e", "#ff8a3d"];

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
