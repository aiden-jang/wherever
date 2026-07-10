import { REACTION_EMOJIS } from "@wherever/shared";
import type { FloatingReaction } from "../useSessionSocket.js";

/** Tap row for throwing an emoji to the whole session during a round. */
export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${emoji}`}
          onClick={() => onReact(emoji)}
          className="grid h-11 w-11 place-items-center rounded-full text-2xl hover:bg-white/10 active:scale-90 transition"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Stable-ish horizontal position (20-80%) derived from the reaction id. */
function leftFor(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return 20 + (sum % 61);
}

/** Overlay of reactions floating up. Positioned within a `relative` container. */
export function FloatingReactions({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="reaction-rise absolute bottom-28 text-4xl drop-shadow-lg"
          style={{ left: `${leftFor(r.id)}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
