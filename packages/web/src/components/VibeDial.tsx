import { resolveVibe, VIBES, vibeOption, vibeReadingLine, type Vibe } from "@wherever/shared";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";

/*
 * The bar shows that three people want quick without showing which three.
 */

export function VibeDial({
  disabled = false,
  counts,
  mine,
  groupSize,
  onPick,
}: {
  disabled?: boolean;
  counts: Partial<Record<Vibe, number>>;
  mine: Vibe | null;
  groupSize: number;
  onPick: (vibe: Vibe | null) => void;
}) {
  const reading = resolveVibe(counts);
  const total = reading.total;

  return (
    <section className="mt-2" aria-label="Group vibe">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-sm font-bold text-cream">What kind of night</h2>
        {total > 0 && <span className="text-xs text-muted">{total} in</span>}
      </div>

      <p className="mt-1.5 text-sm text-white/70" aria-live="polite">
        {vibeReadingLine(reading, groupSize)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {VIBES.map((option) => {
          const votes = counts[option.id] ?? 0;
          const picked = mine === option.id;
          // Share of the votes cast, not of the group: a bar that only fills when everyone has voted
          // reads as broken for the first four taps.
          const share = total > 0 ? Math.round((votes / total) * 100) : 0;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              // Tapping your own pick again clears it, so there is a way out of an accidental tap.
              onClick={() => {
                buzz(8);
                play("tap");
                onPick(picked ? null : option.id);
              }}
              aria-pressed={picked}
              className={`relative overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${
                picked ? "border-white/70 bg-white/5" : "border-white/15 hover:border-white/35"
              }`}
            >
              {/* Behind the label rather than beside it: the count is context, not the content. */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-white/5 transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${share}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span aria-hidden>{option.emoji}</span>
                <span className="font-display text-sm font-bold">{option.label}</span>
                {votes > 0 && <span className="ml-auto text-xs tabular-nums text-muted">{votes}</span>}
              </span>
              <span className="relative mt-0.5 block text-xs leading-snug text-muted">{option.blurb}</span>
            </button>
          );
        })}
      </div>

      {reading.vibe && (
        <p className="mt-2.5 text-xs text-muted">
          The deck prioritizes {vibeOption(reading.vibe).label} places within your dinner filters.
        </p>
      )}
    </section>
  );
}
