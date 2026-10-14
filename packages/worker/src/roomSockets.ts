import type { DecisionResult, Participant, ServerMessage } from "@wherever/shared";
import type { SessionMeta, SocketAttachment } from "./roomState.js";

/* Fan-out and participant projections share one payload shape for joins and round transitions. */

/** Live sockets, deduped by participant: a reconnect overlaps with the socket it replaces. */
export function attachmentsOn(ctx: DurableObjectState, exclude?: WebSocket): SocketAttachment[] {
  const seen = new Map<string, SocketAttachment>();
  for (const socket of ctx.getWebSockets()) {
    // During webSocketClose the closing socket is still returned here, so callers can exclude it.
    if (socket === exclude) continue;
    const att = socket.deserializeAttachment() as SocketAttachment | null;
    if (att) seen.set(att.participantId, att);
  }
  return [...seen.values()];
}

export const participantsOn = (ctx: DurableObjectState, exclude?: WebSocket): Participant[] =>
  attachmentsOn(ctx, exclude).map((att) => ({
    id: att.participantId,
    displayName: att.displayName,
    isHost: att.isHost,
    connected: true,
  }));

export function sendTo(ws: WebSocket, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

export function broadcastTo(ctx: DurableObjectState, message: ServerMessage, exclude?: WebSocket): void {
  const payload = JSON.stringify(message);
  for (const socket of ctx.getWebSockets()) {
    if (socket === exclude) continue;
    try {
      socket.send(payload);
    } catch {
      // gone; the next broadcast omits it.
    }
  }
}

/** One shape for the verdict, whether it is going to one person or the whole room. */
export function resultMessage(
  result: DecisionResult | null,
  totalParticipants: number,
  vetoedCount: number,
  round: number,
): ServerMessage {
  if (!result) return { type: "no_match", vetoedCount };
  return {
    type: "match",
    restaurant: result.restaurant,
    rightSwipes: result.rightSwipes,
    alternatives: result.alternatives ?? [],
    totalParticipants,
    vetoedCount,
    tiedWith: result.tiedWith,
    vetoedTop: result.vetoedTop,
    superTipped: result.superTipped,
    round,
  };
}

/** Shared session projection for presence changes and round transitions. */
export async function broadcastSessionState(ctx: DurableObjectState, closing?: WebSocket): Promise<void> {
  const meta = await ctx.storage.get<SessionMeta>("meta");
  if (!meta) return;
  broadcastTo(
    ctx,
    {
      type: "session_state",
      session: {
        id: meta.code,
        code: meta.code,
        status: meta.status,
        voteMode: meta.voteMode,
        filters: meta.filters,
        participants: participantsOn(ctx, closing),
      },
    },
    closing,
  );
}
