import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { ClientMessage, ServerMessage } from "@wherever/shared";

/*
 * The host closing their laptop, and somebody else ending up in charge.
 *
 * Host lives in three places at once — the `hostId` record, the `clientMap` a refresh returns to,
 * and every live socket's attachment — so a handover that moves two of the three leaves a room that
 * disagrees with itself about who can start the round. The grace window before any of it is what
 * stops a refresh from demoting anybody; the test config shrinks it from fifteen seconds to fifty
 * milliseconds so this runs rather than being skipped.
 */

const BASE = "https://wherever.test";

async function join(code: string, displayName: string, clientId?: string) {
  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: "websocket" } });
  const socket = res.webSocket!;
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener("message", (e) => seen.push(JSON.parse(e.data as string) as ServerMessage));
  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));
  const until = async <T extends ServerMessage["type"]>(
    type: T,
    predicate: (msg: Extract<ServerMessage, { type: T }>) => boolean,
  ) => {
    for (let i = 0; i < 300; i += 1) {
      const hit = seen.filter((m) => m.type === type).find((m) => predicate(m as never));
      if (hit) return hit as Extract<ServerMessage, { type: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${type} matched; saw ${seen.map((m) => m.type).join(", ")}`);
  };
  send({ type: "join", code, displayName, ...(clientId ? { clientId } : {}) });
  await until("identity", () => true);
  return { send, seen, until, close: () => socket.close() };
}

async function session() {
  const res = await SELF.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Alex",
      filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
    }),
  });
  return ((await res.json()) as { code: string }).code;
}

const hostIn = (msg: Extract<ServerMessage, { type: "session_state" }>) =>
  msg.session.participants.find((p) => p.isHost)?.displayName ?? null;

describe("the host leaving", () => {
  it("hands the room to somebody still in it", async () => {
    const code = await session();
    const alex = await join(code, "Alex");
    const sam = await join(code, "Sam");
    expect(hostIn(await sam.until("session_state", (m) => m.session.participants.length === 2))).toBe("Alex");

    alex.close();

    const after = await sam.until("session_state", (m) => hostIn(m) === "Sam");
    expect(after.session.participants.find((p) => p.displayName === "Sam")?.isHost).toBe(true);
    sam.close();
  });

  /* The attachment is the copy the server trusts when a message arrives, so it has to move too. */
  it("lets the new host actually start the round", async () => {
    const code = await session();
    const alex = await join(code, "Alex");
    const sam = await join(code, "Sam");
    await sam.until("session_state", (m) => m.session.participants.length === 2);

    alex.close();
    await sam.until("session_state", (m) => hostIn(m) === "Sam");

    sam.send({ type: "start_round" });
    const dealt = await sam.until("deck", () => true);
    expect(dealt.restaurants.length).toBeGreaterThan(0);
    expect(sam.seen.filter((m) => m.type === "error")).toHaveLength(0);
    sam.close();
  });

  /*
   * The two copies a live socket never reads. `hostId` and the `clientMap` only matter when somebody
   * comes back, so a handover that updates the attachments and nothing else looks perfect until the
   * first refresh, at which point the room has two hosts or none.
   */
  it("still agrees who the host is after everybody refreshes", async () => {
    const code = await session();
    const alexId = crypto.randomUUID();
    const samId = crypto.randomUUID();
    const alex = await join(code, "Alex", alexId);
    const sam = await join(code, "Sam", samId);
    await sam.until("session_state", (m) => m.session.participants.length === 2);

    alex.close();
    await sam.until("session_state", (m) => hostIn(m) === "Sam");
    sam.close();

    // Both come back to the same room, in the order that would break it.
    const samAgain = await join(code, "Sam", samId);
    const alexAgain = await join(code, "Alex", alexId);

    const settled = await alexAgain.until("session_state", (m) => m.session.participants.length === 2);
    expect(hostIn(settled)).toBe("Sam");
    expect(settled.session.participants.filter((p) => p.isHost)).toHaveLength(1);

    // And the server agrees, not just the roster it drew.
    alexAgain.send({ type: "start_round" });
    const refused = await alexAgain.until("error", () => true);
    expect(refused.message).toMatch(/only the host/i);

    samAgain.close();
    alexAgain.close();
  });

  /* A second tab is the same person, which is what the shared clientId says; closing one is not
     leaving, and a grace window that opened here would demote somebody sitting right there. */
  it("does not demote a host who is still on another tab", async () => {
    const code = await session();
    const alexId = crypto.randomUUID();
    const firstTab = await join(code, "Alex", alexId);
    const secondTab = await join(code, "Alex", alexId);
    const sam = await join(code, "Sam");
    await sam.until("session_state", (m) => m.session.participants.length === 2);

    firstTab.close();
    // Well past the shrunk grace window: a second tab means they never left.
    await new Promise((r) => setTimeout(r, 400));
    const states = sam.seen.filter((m) => m.type === "session_state");
    expect(hostIn(states[states.length - 1]!)).toBe("Alex");

    secondTab.close();
    sam.close();
  });
});
