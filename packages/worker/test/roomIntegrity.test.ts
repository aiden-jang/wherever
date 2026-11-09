import { env, exports as workers } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Env } from "../src/env.js";
import type { ClientMessage, ServerMessage } from "@wherever/shared";
import { expect, it } from "vitest";

const creatorId = crypto.randomUUID();
const base = "https://wherever.test";
const filters = { radiusMeters: 8000, maxPriceTier: 4 as const, categories: [] as string[] };

async function create(categories: string[] = []) {
  const response = await workers.default.fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Creator",
      clientId: creatorId,
      filters: { ...filters, categories },
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { code: string }).code;
}

async function open(code: string, clientId?: string) {
  const response = await workers.default.fetch(`${base}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const ws = response.webSocket!;
  ws.accept();
  const seen: ServerMessage[] = [];
  ws.addEventListener("message", (event) => {
    seen.push(JSON.parse(event.data as string) as ServerMessage);
  });
  const send = (message: ClientMessage) => ws.send(JSON.stringify(message));
  if (clientId) {
    const displayName = clientId === creatorId ? "Creator" : clientId;
    send({ type: "join", code, displayName, clientId });
  }
  return { seen, send, close: () => ws.close() };
}

function roomStub(code: string) {
  const rooms = (env as unknown as Env).SESSION_ROOM;
  return rooms.get(rooms.idFromName(code));
}

it("refuses credential-free initialization at the room RPC boundary", async () => {
  const stub = roomStub(crypto.randomUUID());
  await runInDurableObject(stub, async (room, state) => {
    const meta = { code: "ABCDEF", status: "lobby", voteMode: "majority", filters } as const;
    expect(await room.initialize(meta, Date.now(), undefined as never)).toBe(false);
    expect(await state.storage.get("meta")).toBeUndefined();
  });
});

it("does not let an unowned legacy room acquire a host from its invite", async () => {
  const code = await create();
  const stub = roomStub(code);
  await runInDurableObject(stub, async (_room, state) => {
    await state.storage.delete(["hostId", "clientMap"]);
  });
  const guest = await open(code, "legacy-guest");
  try {
    await expect
      .poll(() => guest.seen.find((message) => message.type === "error")?.message)
      .toMatch(/no verified host/i);
    expect(guest.seen.some((message) => message.type === "identity")).toBe(false);
    await runInDurableObject(stub, async (_room, state) => {
      expect(await state.storage.get("hostId")).toBeUndefined();
    });
  } finally {
    guest.close();
  }
});

it("ignores a legacy reservation alarm when the creator has never connected", async () => {
  const code = await create();
  const guest = await open(code, "early-guest");
  const stub = roomStub(code);
  try {
    await expect.poll(() => guest.seen.some((message) => message.type === "identity")).toBe(true);
    await runInDurableObject(stub, async (room, state) => {
      const owner = await state.storage.get("hostId");
      expect(await state.storage.get("hostGraceUntil")).toBeUndefined();
      await state.storage.put("hostGraceUntil", Date.now() - 1);
      await room.alarm();
      expect(await state.storage.get("hostId")).toBe(owner);
    });
    guest.send({ type: "start_round" });
    await expect
      .poll(() => guest.seen.find((message) => message.type === "error")?.message)
      .toMatch(/only the host/i);
  } finally {
    guest.close();
  }
});

it("keeps the host seat when the room empties, even if another guest returns first", async () => {
  const code = await create();
  const host = await open(code, creatorId);
  const stub = roomStub(code);
  await expect.poll(() => host.seen.some((message) => message.type === "identity")).toBe(true);
  host.close();
  await runInDurableObject(stub, async (room, state) => {
    const owner = await state.storage.get("hostId");
    await state.storage.put({ hostGraceUntil: Date.now() - 1, departedHostId: owner });
    await room.alarm();
    expect(await state.storage.get("hostId")).toBe(owner);
  });
  const guest = await open(code, "returning-guest");
  const rejoined = await open(code, creatorId);
  try {
    await expect
      .poll(
        () =>
          guest.seen
            .filter((message) => message.type === "session_state")
            .at(-1)
            ?.session.participants.find((seat) => seat.isHost)?.displayName,
      )
      .toBe("Creator");
  } finally {
    guest.close();
    rejoined.close();
  }
});

it("only admits valid identities and reserves the host role for the creator", async () => {
  const code = await create();
  const listener = await open(code);
  const malformed = await open(code, "constructor");
  const guest = await open(code, "guest-id");
  const host = await open(code, creatorId);
  try {
    await expect.poll(() => malformed.seen.map((m) => m.type)).toContain("error");
    await expect
      .poll(() => host.seen.filter((m) => m.type === "session_state").at(-1)?.session.participants)
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ displayName: "guest-id", isHost: false }),
          expect.objectContaining({ displayName: "Creator", isHost: true }),
        ]),
      );
    malformed.send({ type: "start_round" });
    guest.send({ type: "start_round" });
    await expect.poll(() => guest.seen.map((m) => m.type)).toContain("error");
    expect(guest.seen.some((m) => m.type === "deck")).toBe(false);
    host.send({ type: "start_round" });
    await expect.poll(() => host.seen.map((m) => m.type)).toContain("deck");
    expect(listener.seen).toEqual([]);
    expect(malformed.seen.every((m) => m.type === "error")).toBe(true);
  } finally {
    for (const peer of [host, guest, malformed, listener]) peer.close();
  }
});

it("leaves an empty search editable and keeps a resent super-like spent", async () => {
  const code = await create(["no-such-cuisine"]);
  const host = await open(code, creatorId);
  try {
    await expect.poll(() => host.seen.map((m) => m.type)).toContain("identity");
    host.send({ type: "start_round" });
    await expect.poll(() => host.seen.find((m) => m.type === "error")?.message).toMatch(/No places matched/);
    expect(host.seen.some((m) => m.type === "deck")).toBe(false);
    host.send({ type: "set_filters", filters });
    await expect
      .poll(() => host.seen.filter((m) => m.type === "session_state").at(-1)?.session.filters.categories)
      .toEqual([]);
    host.send({ type: "start_round" });
    await expect.poll(() => host.seen.map((m) => m.type)).toContain("deck");
    const deck = host.seen.find((m) => m.type === "deck")!;
    const swipe = {
      type: "swipe",
      restaurantId: deck.restaurants[0]!.id,
      direction: "right",
      super: true,
    } as const;
    host.send(swipe);
    host.send(swipe);
    await expect
      .poll(() => host.seen.find((m) => m.type === "vote_progress" && m.votesCast === 1))
      .toBeDefined();
    const resumed = await open(code, creatorId);
    try {
      await expect.poll(() => resumed.seen.find((m) => m.type === "deck")?.superUsed).toBe(true);
    } finally {
      resumed.close();
    }
  } finally {
    host.close();
  }
});

it("rejects a ballot from the previous round after redealing the same restaurants", async () => {
  const code = await create();
  const host = await open(code, creatorId);
  try {
    await expect.poll(() => host.seen.map((message) => message.type)).toContain("identity");
    host.send({ type: "start_round" });
    await expect.poll(() => host.seen.find((message) => message.type === "deck")?.roundId).toBe(1);
    const first = host.seen.find((message) => message.type === "deck")!;
    host.send({ type: "swipe", direction: "right", restaurantId: first.restaurants[0]!.id, roundId: 1 });
    host.send({ type: "decide_now" });
    await expect.poll(() => host.seen.map((message) => message.type)).toContain("match");
    host.send({ type: "again", deck: "same" });
    await expect.poll(() => host.seen.filter((message) => message.type === "deck").at(-1)?.roundId).toBe(2);
    host.send({ type: "swipe", direction: "right", restaurantId: first.restaurants[0]!.id, roundId: 1 });
    host.send({ type: "swipe", direction: "right", restaurantId: first.restaurants[1]!.id, roundId: 2 });
    const resumed = await open(code, creatorId);
    try {
      await expect
        .poll(() => resumed.seen.find((message) => message.type === "deck")?.alreadyVoted)
        .toEqual([first.restaurants[1]!.id]);
    } finally {
      resumed.close();
    }
  } finally {
    host.close();
  }
});
