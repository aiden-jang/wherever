import { exports as workers } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

/*
 * The veto is anonymous, and with two people in the room that is arithmetic rather than policy: the
 * burst lands on the other screen the instant you press it, so if they did not press it they know
 * who did. Below three the burst is suppressed and the veto still counts.
 */

const BASE = "https://wherever.test";

async function connect(code: string, displayName: string) {
  const res = await workers.default.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket;
  if (!socket) throw new Error(`no socket for ${displayName} (status ${res.status})`);
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener("message", (e) => {
    seen.push(JSON.parse(e.data as string) as ServerMessage);
  });
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
  const res = await workers.default.fetch(`${BASE}/api/sessions`, {
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

const vetoBursts = (member: { seen: ServerMessage[] }) =>
  member.seen.filter((m) => m.type === "reaction" && m.kind === "veto");

describe("the veto burst", () => {
  it("is not broadcast in a room of two, where it would name the vetoer", async () => {
    const [host, other] = await room(["Alex", "Sam"]);
    host!.send({ type: "start_round" });
    const dealt = await host!.waitFor("deck");

    host!.send({
      type: "swipe",
      restaurantId: dealt.restaurants[0]!.id,
      direction: "left",
      veto: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    expect(vetoBursts(other!)).toHaveLength(0);
    expect(vetoBursts(host!)).toHaveLength(0);

    host!.close();
    other!.close();
  });

  it("is broadcast once there are three people to hide among", async () => {
    const [host, second, third] = await room(["Alex", "Sam", "Robin"]);
    host!.send({ type: "start_round" });
    const dealt = await host!.waitFor("deck");

    host!.send({
      type: "swipe",
      restaurantId: dealt.restaurants[0]!.id,
      direction: "left",
      veto: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    expect(vetoBursts(second!)).toHaveLength(1);
    // Carries no name at any size: the crowd is what hides you, not the payload.
    expect(vetoBursts(second!)[0]).toMatchObject({ emoji: "🚫", from: "" });
    expect(JSON.stringify(vetoBursts(third!))).not.toContain("Alex");

    host!.close();
    second!.close();
    third!.close();
  });
});
