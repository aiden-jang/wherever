import { eq, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { sessions, visitedPlaces } from "./db/schema.js";
import type { Env } from "./env.js";
import type { SessionMeta } from "./roomState.js";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPIRED_ROOM_REASON = "This room has expired. Start a new plan.";

export class ExpiredRoomError extends Error {
  constructor() {
    super(EXPIRED_ROOM_REASON);
  }
}

export async function legacyRoomDeadline(env: Env, code: string): Promise<number> {
  const row = await drizzle(env.DB)
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.code, code))
    .get();
  return row ? row.createdAt.getTime() + SESSION_TTL_MS : 0;
}

export async function assertRoomLive(
  storage: DurableObjectStorage | DurableObjectTransaction,
): Promise<void> {
  const expired = await storage.get<boolean>("expired");
  const deadline = await storage.get<number>("expiresAt");
  if (expired || (deadline !== undefined && deadline <= Date.now())) throw new ExpiredRoomError();
}

// The check and write share a transaction so a delayed provider reply cannot recreate erased state.
export async function putLive(
  storage: DurableObjectStorage,
  entries: Record<string, unknown>,
): Promise<void> {
  await storage.transaction(async (transaction) => {
    await assertRoomLive(transaction);
    await transaction.put(entries);
  });
}

export async function pruneOldSessions(env: Env): Promise<void> {
  const db = drizzle(env.DB);
  const cutoff = new Date(Date.now() - SESSION_TTL_MS);
  // Each room clears its own storage and D1 rows. Keep a failed room indexed so the next run retries it.
  const old = await db
    .select({ code: sessions.code })
    .from(sessions)
    .where(lte(sessions.createdAt, cutoff))
    .limit(20);
  for (const { code } of old) {
    await env.SESSION_ROOM.get(env.SESSION_ROOM.idFromName(code)).expire(code);
  }
  await env.DB.prepare(
    "DELETE FROM visited_places WHERE visited_at<=? AND NOT EXISTS(SELECT 1 FROM sessions WHERE sessions.code=visited_places.session_code)",
  )
    .bind(Math.floor(cutoff.getTime() / 1000))
    .run();
}

// Clear private storage atomically before removing its D1 index; a failed D1 cleanup stays retryable.
export async function expireRoom(ctx: DurableObjectState, env: Env, indexedCode?: string): Promise<void> {
  const meta = await ctx.storage.get<SessionMeta>("meta");
  const code = meta?.code ?? (await ctx.storage.get<string>("expiredCode")) ?? indexedCode;
  await ctx.blockConcurrencyWhile(async () => {
    await ctx.storage.transaction(async (transaction) => {
      const keys = [...(await transaction.list()).keys()];
      if (keys.length) await transaction.delete(keys);
      await transaction.put({ expired: true, ...(code ? { expiredCode: code } : {}) });
    });
    await ctx.storage.deleteAlarm();
    for (const socket of ctx.getWebSockets()) {
      socket.serializeAttachment(null);
      socket.close(1008, EXPIRED_ROOM_REASON);
    }
  });
  if (code) {
    const db = drizzle(env.DB);
    await db.batch([
      db.delete(visitedPlaces).where(eq(visitedPlaces.sessionCode, code)),
      db.delete(sessions).where(eq(sessions.code, code)),
    ]);
  }
}
