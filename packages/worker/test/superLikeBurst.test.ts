import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

const BASE = "https://wherever.test";

async function connect(code: string, displayName: string) {
  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket;
  if (!socket) throw new Error(`no socket for ${displayName} (status ${res.status})`);
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
  send({ type: "join", code, displayName });
  await waitFor("identity");
  return { send, seen, waitFor, close: () => socket.close() };
}

async function room(names: string[]) {
  const res = await SELF.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: names[0],
      filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
    }),
  });
  const { code } = (await res.json()) as { code: string };
  const people = [];
  for (const name of names) people.push(await connect(code, name));
  return people;
}

const superBursts = (member: { seen: ServerMessage[] }) =>
  member.seen.filter((m) => m.type === "reaction" && m.kind === "super");

describe("the super-like burst", () => {
  it("reaches the person who spent it and nobody else", async () => {
    const [host, other] = await room(["Alex", "Sam"]);
    host!.send({ type: "start_round" });
    const dealt = await host!.waitFor("deck");

    host!.send({
      type: "swipe",
      restaurantId: dealt.restaurants[0]!.id,
      direction: "right",
      super: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    expect(superBursts(host!)).toHaveLength(1);
    expect(superBursts(host!)[0]).toMatchObject({ emoji: "⭐", from: "" });
    // Sam is on their own card; a star over it would point at the wrong restaurant.
    expect(superBursts(other!)).toHaveLength(0);

    host!.close();
    other!.close();
  });

  it("stays with the sender in a crowd too, where the veto would fan out", async () => {
    const [host, second, third] = await room(["Alex", "Sam", "Robin"]);
    host!.send({ type: "start_round" });
    const dealt = await host!.waitFor("deck");

    host!.send({
      type: "swipe",
      restaurantId: dealt.restaurants[0]!.id,
      direction: "right",
      super: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    expect(superBursts(host!)).toHaveLength(1);
    expect(superBursts(second!)).toHaveLength(0);
    expect(superBursts(third!)).toHaveLength(0);

    host!.close();
    second!.close();
    third!.close();
  });
});
