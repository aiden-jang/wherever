import type { ClientMap, SocketAttachment } from "./roomState.js";
import type { Env } from "./env.js";

/*
 * Who runs the room when the person running it closes their laptop.
 *
 * Host is cached in three places — the `hostId` record, the `clientMap` that survives a refresh, and
 * each live socket's attachment — so a handover has to move all three or a reconnect picks up the
 * old answer. That, plus the grace window that stops a refresh from demoting anybody, is the whole
 * of this file. None of it needs the env or the database, only the object's own state.
 */

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
    const att = socket.deserializeAttachment() as SocketAttachment | null;
    return att?.participantId === participantId;
  });
}

/**
 * One alarm per Durable Object, and two timers need it: the host-reassign grace window and the round
 * countdown. Set it to whichever deadline is nearer, or clear it when neither is pending. Callers set
 * `hostGraceUntil` / `roundEndsAt` and then call this.
 */
export async function rescheduleAlarm(ctx: DurableObjectState): Promise<void> {
  const times: number[] = [];
  const grace = await ctx.storage.get<number>("hostGraceUntil");
  const roundEnd = await ctx.storage.get<number>("roundEndsAt");
  if (grace) times.push(grace);
  if (roundEnd) times.push(roundEnd);
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
  const att = closing.deserializeAttachment() as SocketAttachment | null;
  if (!att?.isHost) return;
  const hostId = await ctx.storage.get<string>("hostId");
  if (hostId !== att.participantId) return;
  // Still present on another socket (second tab)? They're not gone at all.
  if (hasLiveSocketFor(ctx, att.participantId, closing)) return;
  await ctx.storage.put("hostGraceUntil", Date.now() + hostGraceMs(env));
  await rescheduleAlarm(ctx);
}

/** Move host to another connected person, or clear it if the room emptied. */
export async function reassignHostAway(ctx: DurableObjectState, oldHostId: string): Promise<void> {
  let newHostId: string | undefined;
  for (const socket of ctx.getWebSockets()) {
    const att = socket.deserializeAttachment() as SocketAttachment | null;
    if (att && att.participantId !== oldHostId) {
      newHostId = att.participantId;
      break;
    }
  }

  const map = (await ctx.storage.get<ClientMap>("clientMap")) ?? {};
  for (const [key, entry] of Object.entries(map)) {
    if (entry.participantId === oldHostId) map[key] = { ...entry, isHost: false };
    else if (newHostId && entry.participantId === newHostId) map[key] = { ...entry, isHost: true };
  }

  if (!newHostId) {
    await ctx.storage.delete("hostId");
    await ctx.storage.put("clientMap", map);
    return;
  }

  await ctx.storage.put("hostId", newHostId);
  await ctx.storage.put("clientMap", map);
  for (const socket of ctx.getWebSockets()) {
    const att = socket.deserializeAttachment() as SocketAttachment | null;
    if (att?.participantId === newHostId && !att.isHost) {
      socket.serializeAttachment({ ...att, isHost: true });
    }
  }
}
