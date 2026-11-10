import { exports as workers, env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import type { Restaurant, ServerMessage } from "@wherever/shared";
import { RoundController } from "../src/roundController.js";
import { presentHistory, recordVisit } from "../src/deckSource.js";
import { RoomPlaces } from "../src/roomPlaces.js";
import type { Env } from "../src/env.js";

const bindings = env as unknown as Env;
async function room() {
  const clientId = crypto.randomUUID();
  const created = await workers.default.fetch("https://wherever.test/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId,
      displayName: "QA Host",
      filters: { radiusMeters: 4800, maxPriceTier: 4, categories: [] },
    }),
  });
  expect(created.status).toBe(201);
  const { code } = (await created.json()) as { code: string };
  return { code, clientId, stub: bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(code)) };
}
it("keeps warm past-pick names and provides distinct map links after a cold room", async () => {
  const { code } = await room();
  const google = { ...bindings, RESTAURANT_SOURCE: "google", GOOGLE_PLACES_API_KEY: "fixture-only" } as Env;
  const places = new RoomPlaces(google);
  const a = { id: "old-one", name: "Old Pizza", source: "google" } as Restaurant;
  const b = { id: "old-two", name: "Old Ramen", source: "google" } as Restaurant;
  await recordVisit(google, code, a.id, "");
  await recordVisit(google, code, b.id, "");
  places.remember([a, b]);
  const names = async (catalogue: RoomPlaces) =>
    (await presentHistory(google, code, catalogue)).map((p) => p.name);
  expect(new Set(await names(places))).toEqual(new Set([a.name, b.name]));
  places.remember([{ ...a, id: "new-one", name: "New Pizza" }]);
  expect(new Set(await names(places))).toEqual(new Set([a.name, b.name]));
  const restored = await presentHistory(google, code, new RoomPlaces(google));
  expect(restored.map((pick) => pick.name)).toEqual(["Past pick 1", "Past pick 2"]);
  for (const pick of restored) {
    expect(new URL(pick.mapsUrl!).searchParams.get("query_place_id")).toBe(pick.restaurantId);
  }
});
it("ignores a stale Undo and does not publish the previous result over a replay", async () => {
  const { code, clientId, stub } = await room();
  const response = await workers.default.fetch(`https://wherever.test/ws/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = response.webSocket!;
  ws.accept();
  const messages: ServerMessage[] = [];
  ws.addEventListener("message", (e) => {
    messages.push(JSON.parse(e.data as string) as ServerMessage);
  });
  const send = (m: object) => ws.send(JSON.stringify(m));
  try {
    send({ type: "join", code, displayName: "QA Host", clientId });
    await expect.poll(() => messages.find((m) => m.type === "identity")).toBeTruthy();
    send({ type: "start_round" });
    await expect.poll(() => messages.find((m) => m.type === "deck")).toBeTruthy();
    const deck = messages.find((m) => m.type === "deck");
    if (!deck) throw Error("Missing fixture deck");
    const [first, second] = deck.restaurants;
    if (!first || !second) throw Error("Missing fixture places");
    const oldChoice = crypto.randomUUID();
    const currentChoice = crypto.randomUUID();
    const firstVote = { restaurantId: first.id, roundId: deck.roundId };
    const tally = () => messages.findLast((m) => m.type === "vote_progress")?.votesCast;
    send({ type: "swipe", ...firstVote, choiceId: oldChoice, direction: "left" });
    await expect.poll(tally).toBe(1);
    send({ type: "undo_swipe", ...firstVote, choiceId: oldChoice });
    await expect.poll(tally).toBe(0);
    send({ type: "swipe", ...firstVote, choiceId: currentChoice, direction: "right" });
    await expect.poll(tally).toBe(1);
    send({ type: "undo_swipe", ...firstVote, choiceId: oldChoice });
    await expect
      .poll(() => messages.findLast((m) => m.type === "ballot"))
      .toMatchObject({
        conflict: true,
        choices: [{ choiceId: currentChoice, direction: "right" }],
      });
    send({ type: "swipe", restaurantId: second.id, direction: "right", roundId: deck.roundId });
    await expect.poll(tally).toBe(2);
    send({ type: "decide_now" });
    await expect.poll(() => messages.find((m) => m.type === "match")).toBeTruthy();
    const match = messages.find((m) => m.type === "match");
    if (!match?.alternatives[0]) throw Error("Missing fixture alternative");
    const alternativeId = match.alternatives[0].restaurant.id;
    const index = messages.length;
    await runInDurableObject(stub, async (_instance, state) => {
      const controller = new RoundController(state, bindings);
      let showStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        showStarted = resolve;
      });
      let allowShow!: () => void;
      const pending = new Promise<void>((resolve) => {
        allowShow = resolve;
      });
      const spy = vi.spyOn(controller.places, "showVerdict").mockImplementationOnce(async (result) => {
        showStarted();
        await pending;
        return result;
      });
      const choose = controller.handleChooseAlternative(state.getWebSockets()[0]!, alternativeId);
      try {
        await started;
        await controller.handleAgain(state.getWebSockets()[0]!, "same");
        expect(await state.storage.get("roundNumber")).toBe(2);
      } finally {
        allowShow();
        await choose;
        spy.mockRestore();
      }
    });
    await expect
      .poll(() => messages.slice(index).some((m) => m.type === "deck" && m.roundId === 2))
      .toBe(true);
    expect(messages.slice(index).filter((m) => m.type === "match")).toHaveLength(0);
  } finally {
    ws.close();
  }
});
