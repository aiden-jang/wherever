import { exports as workers, env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect, it, vi } from "vitest";
import { sessions, visitedPlaces } from "../src/db/schema.js";
import { fetchFreshDeck, recordVisit } from "../src/deckSource.js";
import { MockRestaurantSource } from "../src/restaurantSource.js";
import {
  EXPIRED_ROOM_REASON,
  ExpiredRoomError,
  pruneOldSessions,
  SESSION_TTL_MS,
} from "../src/sessionRetention.js";
import type { SessionRoom } from "../src/sessionRoom.js";
import type { SessionMeta } from "../src/roomState.js";
import type { Env } from "../src/env.js";

const bindings = env as unknown as Env;
const db = drizzle(bindings.DB);
async function create() {
  const response = await workers.default.fetch("https://wherever.test/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Synthetic owner",
      filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
    }),
  });
  expect(response.status).toBe(201);
  const { code } = (await response.json()) as { code: string };
  return { code, room: bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(code)) };
}

it("expires room storage, its recent history and D1 row without touching another room", async () => {
  const old = await create(),
    other = await create();
  await recordVisit(bindings, old.code, "old-place", "A private visit");
  await recordVisit(bindings, other.code, "other-place", "Other room visit");
  await runInDurableObject(old.room, async (room: SessionRoom, state) => {
    const deadline = await state.storage.get<number>("expiresAt");
    expect(deadline).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 2000);
    expect(await state.storage.getAlarm()).toBe(deadline);
    await state.storage.put({
      expiresAt: Date.now() - 1,
      clientMap: { secret: { participantId: "private" } },
      votes: { private: true },
      deck: ["private"],
    });
    await room.alarm();
    expect(Object.fromEntries(await state.storage.list())).toEqual({ expired: true, expiredCode: old.code });
    expect(await state.storage.getAlarm()).toBeNull();
  });
  expect(await db.select().from(sessions).where(eq(sessions.code, old.code))).toEqual([]);
  expect(await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, old.code))).toEqual([]);
  expect(await db.select().from(sessions).where(eq(sessions.code, other.code))).toHaveLength(1);
  expect(await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, other.code))).toHaveLength(
    1,
  );
});

it("daily cleanup erases indexed legacy rooms including visits newer than the room cutoff", async () => {
  const old = await create(),
    other = await create();
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - SESSION_TTL_MS - 1000) })
    .where(eq(sessions.code, old.code));
  await recordVisit(bindings, other.code, "other", "Kept");
  await db.insert(visitedPlaces).values({
    id: crypto.randomUUID(),
    sessionCode: old.code,
    restaurantId: "recent",
    name: "Recent visit in expired room",
  });
  await runInDurableObject(old.room, async (_room, state) => {
    await state.storage.delete("expiresAt");
    await state.storage.put("votes", { private: true });
  });
  await pruneOldSessions(bindings);
  await runInDurableObject(old.room, async (_room, state) => {
    expect(Object.fromEntries(await state.storage.list())).toEqual({ expired: true, expiredCode: old.code });
  });
  expect(await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, old.code))).toEqual([]);
  expect(await db.select().from(sessions).where(eq(sessions.code, other.code))).toHaveLength(1);
});

it("cleans an expired index even when room initialization never completed", async () => {
  const { code, room } = await create();
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - SESSION_TTL_MS - 1000) })
    .where(eq(sessions.code, code));
  await runInDurableObject(room, async (_room, state) => {
    await state.storage.deleteAll();
  });
  await pruneOldSessions(bindings);
  expect(await db.select().from(sessions).where(eq(sessions.code, code))).toEqual([]);
  await runInDurableObject(room, async (_room, state) => {
    expect(Object.fromEntries(await state.storage.list())).toEqual({ expired: true, expiredCode: code });
  });
});

it("clears an orphaned legacy room on access and never reinitializes an expired code", async () => {
  const { code, room } = await create();
  await db.delete(sessions).where(eq(sessions.code, code));
  await runInDurableObject(room, async (instance: SessionRoom, state) => {
    const meta = (await state.storage.get<SessionMeta>("meta"))!;
    await state.storage.delete("expiresAt");
    await state.storage.put("winner", { private: true });
    await instance.alarm();
    expect(await instance.initialize(meta)).toBe(false);
    expect(Object.fromEntries(await state.storage.list())).toEqual({ expired: true, expiredCode: code });
  });
  await recordVisit(bindings, code, "late", "Must not return");
  expect(await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, code))).toEqual([]);
});

it("a provider reply finishing after erasure cannot restore a deck or its identities", async () => {
  const { code, room } = await create();
  await runInDurableObject(room, async (instance: SessionRoom, state) => {
    const meta = (await state.storage.get<SessionMeta>("meta"))!;
    const search = vi.spyOn(MockRestaurantSource.prototype, "fetchDeck").mockImplementationOnce(async () => {
      await instance.expire();
      return [{ id: "late", name: "Late provider result" }] as never;
    });
    try {
      await expect(
        fetchFreshDeck({ storage: state.storage, env: bindings, meta, vibeCounts: {} }),
      ).rejects.toBeInstanceOf(ExpiredRoomError);
    } finally {
      search.mockRestore();
    }
    expect(Object.fromEntries(await state.storage.list())).toEqual({ expired: true, expiredCode: code });
  });
});

it("reconnecting to an expired room receives a terminal close instead of private state", async () => {
  const { code, room } = await create();
  await room.expire();
  const response = await workers.default.fetch(`https://wherever.test/ws/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const socket = response.webSocket!;
  let close: CloseEvent | undefined;
  const messages: unknown[] = [];
  socket.addEventListener("close", (event) => {
    close = event;
  });
  socket.addEventListener("message", (event) => {
    messages.push(event.data);
  });
  socket.accept();
  await expect.poll(() => close?.code).toBe(1008);
  expect(close?.reason).toBe(EXPIRED_ROOM_REASON);
  expect(messages).toEqual([]);
});
