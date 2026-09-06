/**
 * The lines under the tally that stop the headcount reading as wrong: a place removed before
 * ranking, a weighted vote the count cannot show, a round that was not the first.
 */
export function VerdictNotes({
  vetoedCount,
  superTipped,
  round,
}: {
  vetoedCount: number;
  superTipped: boolean;
  round: number;
}) {
  return (
    <>
      {/* Without this a vetoed favourite just silently isn't here, which reads as the tally being
        wrong rather than as somebody having used their one no. Count only — who spent it stays
        private, the same as every other vote in a round. */}
      {vetoedCount > 0 && (
        <p className="mt-1 text-sm text-muted">
          🚫 {vetoedCount} {vetoedCount === 1 ? "place was" : "places were"} vetoed out of the running.
        </p>
      )}
      {/* A winner carried by one super-like shows fewer right-swipes than the place it beat, so
        without this the tally looks broken rather than weighted. No name: it is still a vote. */}
      {superTipped && <p className="mt-1 text-sm text-acid">⭐ A super-like tipped it past the headcount.</p>}
      {/* Only once the group has genuinely laboured. Round 1 is just dinner; saying "round 1" about
        it would be noise, and the joke below only earns itself if the number is real. */}
      {round >= 2 && (
        <p className="mt-1 text-sm italic text-muted">
          {round >= 4
            ? `${round} rounds to pick one place. The group chat would have been faster.`
            : `Round ${round}. Worth the wait, presumably.`}
        </p>
      )}
    </>
  );
}
