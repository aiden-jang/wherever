import { exports as workers, env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";
import { RoundController } from "../src/roundController.js";
import type { Env } from "../src/env.js";
import type { SessionRoom } from "../src/sessionRoom.js";

/*
 * Running it back two ways. "new" costs a Places fetch and is capped; "same" re-deals the deck in
 * hand, so it must not spend a round of that cap and must come back with the same restaurants.
 */

const BASE = "https://wherever.test";

async function host() {
  const created = await workers.default.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Alex",
      // Every price tier, so the sample deck is big enough to leave a reserve behind round one.
      filters: { radiusMeters: 4800, maxPriceTier: 4, categories: [] },
    }),
  });
  const { code } = (await created.json()) as { code: string };

  const res = await workers.default.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket!;
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener("message", (e) => {
    seen.push(JSON.parse(e.data as string) as ServerMessage);
  });
  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));
  const waitFor = async <T extends ServerMessage["type"]>(type: T, from = 0) => {
    for (let i = 0; i < 200; i += 1) {
      const hit = seen
        .slice(from)
        .filter((m) => m.type === type)
        .pop();
      if (hit) return hit as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`never got ${type}; saw ${seen.map((m) => m.type).join(", ")}`);
  };
  send({ type: "join", code, displayName: "Alex" });
  await waitFor("identity");
  return { code, send, seen, waitFor, close: () => socket.close() };
}

/** Swipe right on everything so the round decides. */
async function decide(h: Awaited<ReturnType<typeof host>>, deck: { id: string }[]) {
  for (const r of deck) h.send({ type: "swipe", restaurantId: r.id, direction: "right" });
  return h.waitFor("match", h.seen.length - 1);
}

describe("running it back", () => {
  it("starts only one round when replay requests overlap", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    await decide(h, (await h.waitFor("deck")).restaurants);
    const before = h.seen.length;
    const bindings = env as unknown as Env;
    const stub = bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(h.code));
    await runInDurableObject(stub, async (_room: SessionRoom, state) => {
      const controller = new RoundController(state, bindings);
      const socket = state.getWebSockets()[0]!;
      await Promise.all([controller.handleAgain(socket, "same"), controller.handleAgain(socket, "same")]);
    });
    await h.waitFor("deck", before);
    expect(h.seen.slice(before).filter((m) => m.type === "deck")).toHaveLength(1);
    h.close();
  });
  it("deals the very same places on `same`", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    const first = await h.waitFor("deck");
    await decide(h, first.restaurants);

    const beforeSame = h.seen.length;
    h.send({ type: "again", deck: "same" });
    const again = await h.waitFor("deck", beforeSame);
    expect(again.restaurants.map((r) => r.id)).toEqual(first.restaurants.map((r) => r.id));

    h.close();
  });

  /*
   * Nearby Search has no pagination, so asking again with the same filters returns the same places.
   * The overflow from the first fetch is what makes `new` mean anything: before it was held back,
   * the whole result set went out in round one and every re-run answered "picked clean".
   */
  it("deals places it held back rather than asking for the same ones again", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    const first = await h.waitFor("deck");
    await decide(h, first.restaurants);

    const before = h.seen.length;
    h.send({ type: "again", deck: "new" });
    const second = await h.waitFor("deck", before);

    expect(second.restaurants.length).toBeGreaterThan(0);
    const firstIds = new Set(first.restaurants.map((r) => r.id));
    expect(second.restaurants.filter((r) => firstIds.has(r.id))).toEqual([]);
    // Held-back cards, not a fresh search: a search would have had to widen to find anything new.
    const state = await h.waitFor("session_state");
    expect(state.session.filters.radiusMeters).toBe(4800);

    h.close();
  });

  it("widens the search rather than asking the same radius twice", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    await decide(h, (await h.waitFor("deck")).restaurants);

    // Round two comes from the reserve and changes nothing; round three is the one that must widen.
    const afterFirst = h.seen.length;
    h.send({ type: "again", deck: "new" });
    await decide(h, (await h.waitFor("deck", afterFirst)).restaurants);

    const before = h.seen.length;
    h.send({ type: "again", deck: "new" });
    let reply: ServerMessage | undefined;
    for (let i = 0; i < 200 && !reply; i += 1) {
      reply = h.seen.slice(before).find((m) => m.type === "deck" || m.type === "error");
      if (!reply) await new Promise((r) => setTimeout(r, 10));
    }
    // The sample source ignores radius, so the widened search still finds nothing new. What is being
    // asserted is that the app widened before giving up, not that a wider search rescued it.
    const state = await h.waitFor("session_state");
    expect(state.session.filters.radiusMeters).toBe(8000);

    h.close();
  });

  it("says the area is spent only once it genuinely is", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    await decide(h, (await h.waitFor("deck")).restaurants);

    for (let i = 0; i < 10; i += 1) {
      const before = h.seen.length;
      h.send({ type: "again", deck: "new" });
      let reply: ServerMessage | undefined;
      for (let j = 0; j < 200 && !reply; j += 1) {
        reply = h.seen.slice(before).find((m) => m.type === "deck" || m.type === "error");
        if (!reply) await new Promise((r) => setTimeout(r, 10));
      }
      if (!reply) throw new Error("no answer to `again`");
      if (reply.type === "error") {
        expect((reply as { message: string }).message).toMatch(/picked clean/i);
        h.close();
        return;
      }
      await decide(h, (reply as { restaurants: { id: string }[] }).restaurants);
    }
    throw new Error("the sample deck never ran out");
  });

  it("does not spend a capped round on `same`", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    const dealt = await h.waitFor("deck");
    await decide(h, dealt.restaurants);

    // Past the cap (20) with room to spare: if `same` counted, the last of these would be refused.
    for (let i = 0; i < 23; i += 1) {
      const before = h.seen.length;
      h.send({ type: "again", deck: "same" });
      const again = await h.waitFor("deck", before);
      await decide(h, again.restaurants);
    }
    expect(h.seen.filter((m) => m.type === "error")).toHaveLength(0);

    /*
     * And the cap is still there for the mode that pays for it. Asking for new places after all
     * those same-deck rounds must not be refused *for being over the cap* — the sample source is
     * finite, so it answers with the held-back cards or "picked clean", both of which are correct.
     */
    const before = h.seen.length;
    h.send({ type: "again", deck: "new" });
    for (let i = 0; i < 200; i += 1) {
      const reply = h.seen.slice(before).find((m) => m.type === "deck" || m.type === "error");
      if (reply) {
        if (reply.type === "error")
          expect((reply as { message: string }).message).not.toMatch(/lot of rounds/i);
        h.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("no answer to `again`");
  });
});
