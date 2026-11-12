import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Restaurant, ServerMessage } from "@wherever/shared";
import { changeBallot } from "./roomBallot.js";
import { sendResumedDeck } from "./roundResume.js";
import type { RoomPlaces } from "./roomPlaces.js";

let values: Map<string, unknown>;
function socket(id: string) {
  const messages: ServerMessage[] = [];
  return Object.assign(
    {
      readyState: 1,
      deserializeAttachment: () => ({ participantId: id, displayName: id, isHost: id === "host" }),
      send: (raw: string) => messages.push(JSON.parse(raw) as ServerMessage),
    } as unknown as WebSocket,
    { messages },
  );
}
function room() {
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string | Record<string, unknown>, value?: unknown) => {
      if (typeof key === "string") values.set(key, structuredClone(value));
      else for (const [name, entry] of Object.entries(key)) values.set(name, structuredClone(entry));
    },
    transaction: async <T>(action: (transaction: unknown) => Promise<T>): Promise<T> => action(storage),
  } as unknown as DurableObjectStorage;
  const host = socket("host"),
    tab = socket("host"),
    guest = socket("guest");
  const ctx = { storage, getWebSockets: () => [host, tab, guest] } as unknown as DurableObjectState;
  return { ctx, host, tab, guest };
}
const places = { forDeck: (place: Restaurant) => place } as RoomPlaces;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  values = new Map([
    ["meta", { code: "ABCDEF", status: "swiping", filters: {} }],
    ["roundNumber", 1],
    ["deck", ["a", "b", "c"].map((id) => ({ id, name: id }))],
  ] as [string, unknown][]);
  vi.stubGlobal("WebSocket", { OPEN: 1 });
});
it("enforces one step back across sockets and reconnects until a new vote is cast", async () => {
  const { ctx, host, tab } = room();
  await changeBallot(ctx, host, "a", 1, { direction: "right", choiceId: "a1", super: true });
  await changeBallot(ctx, host, "b", 1, { direction: "left", choiceId: "b1" });
  await changeBallot(ctx, host, "b", 1, undefined, "b1");
  expect(tab.messages.at(-1)).toMatchObject({
    type: "ballot",
    canUndo: false,
    choices: [{ restaurantId: "a", super: true }],
  });
  await changeBallot(ctx, tab, "a", 1, undefined, "a1");
  expect(tab.messages.at(-1)).toMatchObject({ type: "ballot", conflict: true, canUndo: false });
  expect(Object.keys(values.get("votes") as object)).toEqual(["host:a"]);
  const reconnected = socket("host");
  await sendResumedDeck(ctx.storage, places, reconnected, "host", true);
  expect(reconnected.messages.at(-1)).toMatchObject({ type: "deck", canUndo: false, superUsed: true });
  await changeBallot(ctx, host, "b", 1, { direction: "right", choiceId: "b2" });
  expect(tab.messages.at(-1)).toMatchObject({ type: "ballot", canUndo: true });
  await changeBallot(ctx, host, "b", 1, undefined, "b2");
  expect(Object.keys(values.get("votes") as object)).toEqual(["host:a"]);
});
it("keeps Undo private to each participant, resets for a new round, and preserves special-vote limits", async () => {
  const { ctx, host, guest } = room();
  await changeBallot(ctx, host, "a", 1, { direction: "left", choiceId: "a1", veto: true });
  await changeBallot(ctx, host, "a", 1, undefined, "a1");
  await changeBallot(ctx, guest, "b", 1, { direction: "right", choiceId: "g1" });
  await changeBallot(ctx, guest, "b", 1, undefined, "g1");
  expect(Object.keys(values.get("votes") as object)).toHaveLength(0);
  values.set("roundNumber", 2);
  await changeBallot(ctx, host, "a", 2, { direction: "left", choiceId: "a2", veto: true });
  await changeBallot(ctx, host, "b", 2, { direction: "left", choiceId: "b2", veto: true });
  expect(values.get("votes")).toMatchObject({ "host:a": { veto: true }, "host:b": { direction: "left" } });
  expect((values.get("votes") as Record<string, { veto?: boolean }>)["host:b"]!.veto).toBeUndefined();
  await changeBallot(ctx, host, "b", 2, undefined, "b2");
  await changeBallot(ctx, host, "a", 2, undefined, "a2");
  expect(host.messages.at(-1)).toMatchObject({ type: "ballot", canUndo: false, conflict: true });
});
