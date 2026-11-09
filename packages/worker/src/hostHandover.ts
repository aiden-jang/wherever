import { hostCredentialSchema } from "@wherever/shared/schemas";
import { socketIdentity, type ClientMap } from "./roomState.js";
import type { Env } from "./env.js";
import { putLive } from "./sessionRetention.js";

// Handover must update hostId, the persisted clientMap, and live socket attachments together.

/*
 * Long enough to cover a refresh or a tunnel, short enough that a real departure is not a wait.
 * Read from env like the usage caps are, so a test can shrink it rather than sit out fifteen
 * seconds; wrangler.toml sets nothing, so production gets the default.
 */
const DEFAULT_HOST_GRACE_MS = 15_000;
export const hostGraceMs = (env: Env): number => Number(env.HOST_GRACE_MS) || DEFAULT_HOST_GRACE_MS;

export function hasLiveSocketFor(
  ctx: DurableObjectState,
  participantId: string,
  exclude?: WebSocket,
): boolean {
  return ctx.getWebSockets().some((socket) => {
    if (socket === exclude) return false;
    const att = socketIdentity(socket);
    return att?.participantId === participantId;
  });
}

/**
 * Host handover, the round countdown and room expiry share the object's single alarm.
 */
export async function rescheduleAlarm(ctx: DurableObjectState): Promise<void> {
  const times: number[] = [];
  const grace = await ctx.storage.get<number>("hostGraceUntil");
  const roundEnd = await ctx.storage.get<number>("roundEndsAt");
  const expires = await ctx.storage.get<number>("expiresAt");
  if (grace) times.push(grace);
  if (roundEnd) times.push(roundEnd);
  if (expires) times.push(expires);
  if (times.length === 0) {
    await ctx.storage.deleteAlarm();
    return;
  }
  await ctx.storage.setAlarm(Math.min(...times));
}

/**
 * Don't hand off host the moment their last socket drops: a refresh or a blip would demote them.
 * Start a grace window instead, and only reassign in `alarm()` if they are still gone.
 */
export async function beginHostGraceIfNeeded(
  ctx: DurableObjectState,
  env: Env,
  closing: WebSocket,
): Promise<void> {
  const att = socketIdentity(closing);
  if (!att?.isHost) return;
  const hostId = await ctx.storage.get<string>("hostId");
  if (hostId !== att.participantId) return;
  // Still present on another socket (second tab)? They're not gone at all.
  if (hasLiveSocketFor(ctx, att.participantId, closing)) return;
  await putLive(ctx.storage, { hostGraceUntil: Date.now() + hostGraceMs(env), departedHostId: hostId });
  await rescheduleAlarm(ctx);
}

/** Keep a reconnectable owner even when the room has no eligible participant online. */
export async function reassignHostAway(ctx: DurableObjectState, oldHostId: string): Promise<void> {
  const map = (await ctx.storage.get<ClientMap>("clientMap")) ?? {};
  const eligible = new Set(
    Object.entries(map)
      .filter(([clientId]) => hostCredentialSchema.safeParse(clientId).success)
      .map(([, entry]) => entry.participantId),
  );
  const successor = ctx
    .getWebSockets()
    .map(socketIdentity)
    .find((att) => att && att.participantId !== oldHostId && eligible.has(att.participantId));
  if (!successor) return;

  const newHostId = successor.participantId;
  for (const [key, entry] of Object.entries(map)) {
    map[key] = { ...entry, isHost: entry.participantId === newHostId };
  }
  await putLive(ctx.storage, { hostId: newHostId, clientMap: map });
  for (const socket of ctx.getWebSockets()) {
    const att = socketIdentity(socket);
    if (att && att.isHost !== (att.participantId === newHostId)) {
      socket.serializeAttachment({ ...att, isHost: att.participantId === newHostId });
    }
  }
}
