import type { Vibe } from "@wherever/shared";
import type { SocketAttachment } from "./roomState.js";
import { sendTo } from "./roomSockets.js";

/* Only aggregate vibe counts leave storage; a participant receives their own choice for reconnects. */

type VibeMap = Record<string, Vibe>;

const tally = (map: VibeMap): Partial<Record<Vibe, number>> => {
  const counts: Partial<Record<Vibe, number>> = {};
  for (const picked of Object.values(map)) counts[picked] = (counts[picked] ?? 0) + 1;
  return counts;
};

export const readVibes = async (storage: DurableObjectStorage): Promise<VibeMap> =>
  (await storage.get<VibeMap>("vibes")) ?? {};

export const vibeCounts = async (storage: DurableObjectStorage) => tally(await readVibes(storage));

/** One person's pick, or clearing it. Returns the map so the caller can fan it out. */
export async function setVibe(
  storage: DurableObjectStorage,
  participantId: string,
  vibe: Vibe | null,
): Promise<VibeMap> {
  const vibes = await readVibes(storage);
  if (vibe) vibes[participantId] = vibe;
  else delete vibes[participantId];
  await storage.put("vibes", vibes);
  return vibes;
}

/**
 * Tallies to everyone, plus each person's own pick back to them. One message per socket rather than
 * a broadcast, because `yours` is the only field that differs per recipient.
 */
export async function sendVibes(ctx: DurableObjectState, vibes?: VibeMap): Promise<void> {
  const map = vibes ?? (await readVibes(ctx.storage));
  const counts = tally(map);
  for (const socket of ctx.getWebSockets()) {
    const att = socket.deserializeAttachment() as SocketAttachment | null;
    if (!att) continue;
    sendTo(socket, { type: "vibes", counts, yours: map[att.participantId] ?? null });
  }
}
