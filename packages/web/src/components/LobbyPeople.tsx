import { initialsFor, type Participant, type TastePulse } from "@wherever/shared";
import { useLine } from "../useLine.js";

/*
 * Who is in the room and what they have done with it. Everything here reads from the session and
 * holds no state of its own, which is why it can live away from the screen that runs the round.
 */

/*
 * The only thing here that moves when somebody else does.
 *
 * The avatars sit still and `finishedCount` ticks only when a whole deck is done, which can be minutes
 * apart. Votes cast changes on every swipe by anyone, so it is the one continuous sign you are not
 * swiping alone. Keyed on the number so the pulse restarts each time one lands.
 */
export function LiveVotes({ count }: { count: number }) {
  // Before anybody has voted this is the one line on the screen, and "No votes yet." was the only
  // place in the app that answered a wait with a label instead of a sentence.
  const quiet = useLine("quiet");
  if (count <= 0) return <p className="mt-3 text-sm text-muted">{quiet}</p>;
  return (
    <p className="mt-3 text-sm text-muted">
      <span key={count} className="vote-tick inline-block font-semibold text-cream tabular-nums">
        {count}
      </span>{" "}
      {count === 1 ? "vote" : "votes"} in
    </p>
  );
}

export function ParticipantChip({ p }: { p: Participant }) {
  return (
    <div className="participant-tile flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3">
      <span className="relative grid place-items-center h-10 w-10 rounded-2xl bg-ember text-ink font-bold">
        {initialsFor(p.displayName)}
        {/* Live presence: solid green pulse when connected, hollow grey when they've dropped. */}
        <span
          role="img"
          aria-label={p.connected ? "connected" : "disconnected"}
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink ${
            p.connected ? "bg-acid animate-pulse" : "bg-transparent border-muted"
          }`}
          title={p.connected ? "here" : "disconnected"}
        />
      </span>
      {/* min-w-0 + break so the name is what gives on a narrow screen. Without it a 24-character
          unbroken name refuses to shrink and shoves the host badge past the right edge of the
          phone — the row looked fine, and the whole page scrolled sideways. */}
      <span className={`min-w-0 break-words font-medium ${p.connected ? "" : "text-muted"}`}>
        {p.displayName}
        <span className="member-status">{p.connected ? "At the table" : "Disconnected"}</span>
      </span>
      {p.isHost && (
        <span className="ml-auto shrink-0 rounded-full bg-acid/15 text-acid text-xs font-semibold px-2 py-0.5">
          host
        </span>
      )}
    </div>
  );
}

/** Only rendered when the host turned reveal on, and the server only sends `finishedIds` then, so an
 *  anonymous round has no identities to leak. */
export function VoterAvatars({
  participants,
  finishedIds,
}: {
  participants: Participant[];
  finishedIds: string[];
}) {
  const done = new Set(finishedIds);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {participants.map((p) => {
        const finished = done.has(p.id);
        return (
          <div
            key={p.id}
            className="relative"
            title={`${p.displayName}: ${finished ? "done" : "still deciding"}`}
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold transition-colors ${
                finished ? "bg-gradient-to-br from-ember to-flare text-ink" : "bg-white/10 text-muted"
              }`}
            >
              {initialsFor(p.displayName)}
            </span>
            {finished && (
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-ink bg-acid text-2xs font-bold text-ink">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Anonymous live texture for the round. It deliberately cannot name a person or restaurant. */
export function GroupTasteMap({ pulse }: { pulse: TastePulse }) {
  const appetite = pulse.rightRate < 30 ? "selective" : pulse.rightRate < 60 ? "curious" : "easy crowd";
  const aligned = pulse.strongestOverlap >= Math.max(2, Math.ceil(pulse.activeVoters * 0.6));
  const overlap = aligned
    ? "same wavelength"
    : pulse.strongestOverlap >= 2
      ? "a little spark"
      : "still exploring";
  const price =
    pulse.averagePriceTier === null
      ? "no yeses yet"
      : "$".repeat(Math.max(1, Math.min(4, Math.round(pulse.averagePriceTier))));

  return (
    <div
      className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs"
      aria-label={`Anonymous group pulse: ${appetite}, ${overlap}, leaning ${price}`}
      title="Built from anonymous totals. No names or restaurants are revealed."
    >
      <span className="font-semibold text-ember">group pulse</span>
      <span className="text-muted">{appetite}</span>
      <span aria-hidden className="text-white/20">
        ·
      </span>
      <span className="text-muted">{overlap}</span>
      <span aria-hidden className="text-white/20">
        ·
      </span>
      <span className="font-semibold tracking-wide text-cream">{price}</span>
    </div>
  );
}
