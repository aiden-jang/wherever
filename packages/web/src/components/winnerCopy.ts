import { line, type Restaurant } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";
/*
 * Same line for everybody in the room: the seed comes from the winner's id, not a clock or a random,
 * so two phones looking at the same result never disagree about what just happened.
 */
export function seedFrom(id: string): number {
  let n = 0;
  for (const character of id) n = (n + character.charCodeAt(0)) % 997;
  return n;
}

/** The tally is useful evidence; this is the human version of what it means. */
/*
 * One person is not a tie, however many places finished level.
 *
 * Alone, every place you liked scores exactly one, so a tie is guaranteed the moment you like two.
 * Keep the tie copy out of this case. "Dead tie. Of course it is." and "6 places finished level"
 * are jokes about a committee that was never in the room, and this is the first thing most
 * people see, because opening it alone to find out what it is is how everybody starts.
 */
export function consensusLine(rightSwipes: number, totalParticipants: number, seed: number): string {
  if (totalParticipants <= 1) return line("solo", seed);
  if (rightSwipes === totalParticipants) return "Unanimous. Put it in the group chat.";
  if (rightSwipes / totalParticipants >= 0.75) return "A clear majority. Dinner is handled.";
  return "The committee picked a winner.";
}

/** A share should read like a plan someone can act on, not an app notification. */
export function planText(
  r: Restaurant,
  rightSwipes: number,
  totalParticipants: number,
  reasons: string[] = [],
  backup?: Restaurant,
): string {
  const where = r.address ? `\n${r.address}` : "";
  const availability =
    r.businessStatus === "CLOSED_PERMANENTLY"
      ? " Permanently closed."
      : r.businessStatus === "CLOSED_TEMPORARILY"
        ? " Temporarily closed."
        : r.openNow == null
          ? ""
          : r.openNow
            ? " Open now."
            : " Closed right now.";
  const why = reasons.length > 0 ? `\nWhy it won: ${reasons.join(" · ")}` : "";
  const fallback = backup ? `\nPlan B: ${backup.name}\n${mapsUrl(backup)}` : "";
  return `Dinner plan: ${r.name}${where}\nPicked by ${rightSwipes} of ${totalParticipants}.${availability}${why}${fallback}`;
}
