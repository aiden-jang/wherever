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

/*
 * Overlay of reactions floating up. Positioned within a `relative` container.
 *
 * A veto and a super-like arrive on this same channel but are not chatter: one takes a place away
 * from everybody and the other weighs the tally. They land in the middle at twice the size behind a
 * tint of their own colour, so they cannot be mistaken for somebody tapping a laughing face.
 */
export function FloatingReactions({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {reactions.map((r) =>
        r.kind ? (
          <span key={r.id} className="verdict-flash absolute inset-0 grid place-items-center">
            <span
              className={`absolute inset-0 ${r.kind === "veto" ? "bg-flare/20" : "bg-acid/20"}`}
            />
            <span className="relative text-7xl drop-shadow-2xl">{r.emoji}</span>
          </span>
        ) : (
          <span
            key={r.id}
            className="reaction-rise absolute bottom-28 text-4xl drop-shadow-lg"
            style={{ left: `${leftFor(r.id)}%` }}
          >
            {r.emoji}
          </span>
        ),
      )}
    </div>
  );
}
