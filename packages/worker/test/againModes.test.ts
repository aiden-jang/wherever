import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

/*
 * Running it back two ways. "new" costs a Places fetch and is capped; "same" re-deals the deck in
 * hand, so it must not spend a round of that cap and must come back with the same restaurants.
 */

const BASE = "https://wherever.test";

async function host() {
  const created = await SELF.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Alex",
      filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
    }),
  });
  const { code } = (await created.json()) as { code: string };

  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket!;
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener("message", (e) => seen.push(JSON.parse(e.data as string) as ServerMessage));
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
  return { send, seen, waitFor, close: () => socket.close() };
}

/** Swipe right on everything so the round decides. */
async function decide(h: Awaited<ReturnType<typeof host>>, deck: { id: string }[]) {
  for (const r of deck) h.send({ type: "swipe", restaurantId: r.id, direction: "right" });
  return h.waitFor("match", h.seen.length - 1);
}

describe("running it back", () => {
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
   * `new` excludes the whole deck just swiped, not only the winner. The sample source holds six
   * places, so having seen all six there is genuinely nothing left and the room is told so. Before
   * the exclusion widened, this returned the five that were not picked and called them new.
   */
  it("will not pass off the deck you just swiped as new places", async () => {
    const h = await host();
    h.send({ type: "start_round" });
    const dealt = await h.waitFor("deck");
    await decide(h, dealt.restaurants);

    const before = h.seen.length;
    h.send({ type: "again", deck: "new" });
    for (let i = 0; i < 200; i += 1) {
      const reply = h.seen.slice(before).find((m) => m.type === "deck" || m.type === "error");
      if (reply) {
        expect(reply.type).toBe("error");
        expect((reply as { message: string }).message).toMatch(/picked clean/i);
        h.close();
        return;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("no answer to `again`");
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
     * six places deep so it answers "picked clean", which is a different and correct refusal.
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
