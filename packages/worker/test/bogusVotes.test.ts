import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

/*
 * "Finished the deck" is counted as distinct restaurant ids voted. The ids come from the client, so
 * without a check against the deck a client can finish without seeing a card.
 */

const BASE = "https://wherever.test";

async function connect(code: string) {
  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket;
  if (!socket) throw new Error(`no socket (status ${res.status})`);
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener("message", (e) => seen.push(JSON.parse(e.data as string) as ServerMessage));
  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));
  const waitFor = async <T extends ServerMessage["type"]>(type: T) => {
    for (let i = 0; i < 150; i += 1) {
      const hit = seen.filter((m) => m.type === type).pop();
      if (hit) return hit as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`never got ${type}; saw ${seen.map((m) => m.type).join(", ")}`);
  };
  return { send, seen, waitFor, close: () => socket.close() };
}

describe("votes for cards that were never dealt", () => {
  it("does not let a client finish the deck without seeing it", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Alex",
        filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
      }),
    });
    const { code } = (await res.json()) as { code: string };

    const host = await connect(code);
    host.send({ type: "join", code, displayName: "Alex" });
    await host.waitFor("identity");
    host.send({ type: "start_round" });
    const dealt = await host.waitFor("deck");
    expect(dealt.restaurants.length).toBeGreaterThan(0);

    // Enough made-up ids to cover the deck twice over.
    for (let i = 0; i < dealt.restaurants.length * 2; i += 1) {
      host.send({ type: "swipe", restaurantId: `made-up-${i}`, direction: "right" });
    }
    await new Promise((r) => setTimeout(r, 400));

    const progress = await host.waitFor("vote_progress");
    expect(progress.finishedCount).toBe(0);
    host.close();
  });

  it("still counts a vote for a card that was dealt", async () => {
    const res = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Sam",
        filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
      }),
    });
    const { code } = (await res.json()) as { code: string };

    const host = await connect(code);
    host.send({ type: "join", code, displayName: "Sam" });
    await host.waitFor("identity");
    host.send({ type: "start_round" });
    const dealt = await host.waitFor("deck");

    for (const r of dealt.restaurants) host.send({ type: "swipe", restaurantId: r.id, direction: "right" });

    // A real full deck finishes, which is what proves the check rejects ids rather than all votes.
    const match = await host.waitFor("match");
    expect(match.restaurant).toBeTruthy();
    host.close();
  });
});
