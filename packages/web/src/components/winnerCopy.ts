import { line, type Restaurant } from "@wherever/shared";
import { mapsUrl } from "./DirectionsDialog.js";
import { availabilityLabel } from "./RestaurantFacts.js";
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
// A single participant can tie their own choices; omit jokes about a committee in that case.
export function consensusLine(rightSwipes: number, totalParticipants: number, seed: number): string {
  if (totalParticipants <= 1) return line("solo", seed);
  if (rightSwipes === totalParticipants) return "Everyone said yes. Dinner is handled.";
  if (rightSwipes / totalParticipants >= 0.75) return "A clear majority. Dinner is handled.";
  return "Highest score. We have a dinner plan.";
}

/** A share should read like a plan someone can act on, not an app notification. */
export function planText(
  r: Restaurant,
  rightSwipes: number,
  totalParticipants: number,
  reasons: string[] = [],
  backup?: Restaurant,
  hostPicked = false,
): string {
  const where = r.address ? `\n${r.address}` : "";
  const availability = availabilityLabel(r);
  const why = reasons.length > 0 ? `\nAbout this pick: ${reasons.join(" · ")}` : "";
  const fallback = backup ? `\nPlan B: ${backup.name}\n${mapsUrl(backup)}` : "";
  const support = hostPicked ? "The host chose this backup. " : "";
  const votes = totalParticipants <= 1 ? "Your pick." : `${rightSwipes} of ${totalParticipants} voted yes.`;
  return `Dinner plan: ${r.name}${where}\n${support}${votes}${availability ? ` ${availability}.` : ""}${why}${fallback}`;
}
