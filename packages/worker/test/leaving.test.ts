import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

/*
 * A socket that closes is still returned by ctx.getWebSockets() while it is closing, so every fan-out
 * during a departure has to exclude it by hand. Miss that and the leaver lingers in the roster, which
 * is not cosmetic: the same count decides "0 of 2 done" and how many people a result was picked by.
 */

const BASE = "https://wherever.test";

async function join(code: string, displayName: string) {
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
  send({ type: "join", code, displayName });
  await waitFor("identity");
  return { send, seen, waitFor, close: () => socket.close() };
}

describe("someone leaving", () => {
  it("drops out of the roster everyone else can see", async () => {
    const created = await SELF.fetch(`${BASE}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Alex",
        filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
      }),
    });
    const { code } = (await created.json()) as { code: string };

    const host = await join(code, "Alex");
    const sam = await join(code, "Sam");

    const both = await host.waitFor("session_state");
    expect(both.session.participants.map((p) => p.displayName).sort()).toEqual(["Alex", "Sam"]);

    const before = host.seen.length;
    sam.close();

    const after = await host.waitFor("session_state", before);
    expect(after.session.participants.map((p) => p.displayName)).toEqual(["Alex"]);

    host.close();
  });
});
