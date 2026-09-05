import { REACTION_EMOJIS, reactionLane } from "@wherever/shared";
import type { FloatingReaction } from "../useSessionSocket.js";
import { buzz } from "./haptics.js";
import { play } from "./sound.js";

/** Tap row for throwing an emoji to the whole session during a round. */
export function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`React ${emoji}`}
          onClick={() => {
            buzz(8);
            play("tap");
            onReact(emoji);
          }}
          className="grid h-11 w-11 place-items-center rounded-full text-2xl hover:bg-white/10 active:scale-90 transition"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/*
 * Overlay of reactions floating up. Positioned within a `relative` container.
 *
 * A veto and a super-like arrive on this same channel but are not chatter: one takes a place away
 * from everybody and the other weighs the tally. They land in the middle at twice the size behind a
 * tint of their own colour, so they cannot be mistaken for somebody tapping a laughing face.
 *
 * Chatter rises in a lane belonging to whoever sent it and carries their name, so a reaction reads
 * as a person in the room rather than as weather. System events have no sender and get neither.
 */
export function FloatingReactions({
  reactions,
  roster = [],
}: {
  reactions: FloatingReaction[];
  /** Participant ids in seat order, so each person gets a lane of their own. */
  roster?: readonly string[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {reactions.map((r) =>
        r.kind ? (
          <span key={r.id} className="verdict-flash absolute inset-0 grid place-items-center">
            <span className={`absolute inset-0 ${r.kind === "veto" ? "bg-flare/20" : "bg-acid/20"}`} />
            <span className="relative text-7xl drop-shadow-2xl">{r.emoji}</span>
          </span>
        ) : (
          <span
            key={r.id}
            className="reaction-rise absolute bottom-28 flex flex-col items-center drop-shadow-lg"
            style={{ left: `${reactionLane(r.fromId ?? r.from, r.id, roster)}%` }}
          >
            <span className="text-4xl">{r.emoji}</span>
            {r.from && (
              <span className="mt-0.5 max-w-24 truncate text-2xs font-semibold text-cream/80">{r.from}</span>
            )}
          </span>
        ),
      )}
    </div>
  );
}
