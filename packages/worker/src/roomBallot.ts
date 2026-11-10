import type { BallotChoice, Restaurant } from "@wherever/shared";
import { attachmentsOn, broadcastTo, sendTo } from "./roomSockets.js";
import { readRoundNumber, socketIdentity, type SessionMeta, type VoteMap } from "./roomState.js";
import { ownBallot } from "./roundResume.js";
import { assertRoomLive } from "./sessionRetention.js";

export async function changeBallot(
  ctx: DurableObjectState,
  ws: WebSocket,
  restaurantId: string,
  requestedRound?: number,
  choice?: Omit<BallotChoice, "restaurantId">,
  expectedChoiceId?: string | null,
) {
  const identity = socketIdentity(ws);
  if (!identity) return;
  const { participantId } = identity;
  const result = await ctx.storage.transaction(async (storage) => {
    const meta = await storage.get<SessionMeta>("meta");
    const roundId = await readRoundNumber(storage);
    const deadline = await storage.get<number>("roundEndsAt");
    if (
      meta?.status !== "swiping" ||
      (requestedRound !== undefined && requestedRound !== roundId) ||
      (deadline !== undefined && deadline <= Date.now())
    )
      return;
    const deck = await storage.get<Restaurant[]>("deck");
    if (!deck?.some((place) => place.id === restaurantId)) return;
    await assertRoomLive(storage);
    const votes = (await storage.get<VoteMap>("votes")) ?? {};
    const key = `${participantId}:${restaurantId}`;
    const own = ownBallot(Object.values(votes), participantId);
    const last = own.at(-1);
    const undoMatches =
      last?.restaurantId === restaurantId &&
      (expectedChoiceId === undefined || (last.choiceId ?? null) === expectedChoiceId);
    if (choice ? Boolean(votes[key]) : !undoMatches) {
      return { roundId, choices: own, conflict: true } as const;
    }

    if (choice) {
      votes[key] = {
        participantId,
        restaurantId,
        direction: choice.direction,
        ...(choice.choiceId ? { choiceId: choice.choiceId } : {}),
        ...(choice.direction === "right" && choice.super && !own.some((v) => v.super) ? { super: true } : {}),
        ...(choice.direction === "left" && choice.veto && !own.some((v) => v.veto) ? { veto: true } : {}),
      };
    } else delete votes[key];
    await storage.put("votes", votes);
    const accepted = votes[key];
    const adjusted =
      choice &&
      (Boolean(choice.super) !== Boolean(accepted?.super) ||
        Boolean(choice.veto) !== Boolean(accepted?.veto));
    return {
      meta,
      roundId,
      choices: ownBallot(Object.values(votes), participantId),
      accepted,
      adjusted,
    } as const;
  });
  if (!result) return;

  // Only sockets belonging to this participant receive their ballot, never other diners.
  for (const socket of ctx.getWebSockets()) {
    if (socketIdentity(socket)?.participantId !== participantId || socket.readyState !== WebSocket.OPEN)
      continue;
    if (socket === ws && !result.conflict && !result.adjusted) continue;
    sendTo(socket, {
      type: "ballot",
      roundId: result.roundId,
      choices: result.choices,
      ...(socket === ws && result.conflict ? { conflict: true } : {}),
    });
  }
  if (result.conflict) return;
  if (result.accepted?.super && ws.readyState === WebSocket.OPEN)
    sendTo(ws, { type: "reaction", emoji: "⭐", from: "", kind: "super" });
  if (result.accepted?.veto && attachmentsOn(ctx).length >= 3)
    broadcastTo(ctx, { type: "reaction", emoji: "🚫", from: "", kind: "veto" });
  return { meta: result.meta, super: result.accepted?.super };
}
