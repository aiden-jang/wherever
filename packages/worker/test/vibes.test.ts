import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '@wherever/shared';

/* Drives the real protocol: the "nobody finds out who said fancy" promise has to hold at the wire. */

const BASE = 'https://wherever.test';

async function createSession(): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Alex',
      filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] },
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

interface Member {
  send: (msg: ClientMessage) => void;
  /** Every message this socket has received, in order. */
  seen: ServerMessage[];
  /** Wait until this socket has received a message of `type`, returning the most recent one. */
  next: <T extends ServerMessage['type']>(type: T, from?: number) => Promise<Extract<ServerMessage, { type: T }>>;
  /** Wait for a message of `type` that satisfies `predicate`. */
  until: <T extends ServerMessage['type']>(
    type: T,
    predicate: (msg: Extract<ServerMessage, { type: T }>) => boolean,
  ) => Promise<Extract<ServerMessage, { type: T }>>;
  close: () => void;
}

async function join(code: string, displayName: string): Promise<Member> {
  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: 'websocket' } });
  const socket = res.webSocket;
  if (!socket) throw new Error(`no socket for ${displayName} (status ${res.status})`);
  socket.accept();

  const seen: ServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    seen.push(JSON.parse(event.data as string) as ServerMessage);
  });

  const member: Member = {
    send: (msg) => socket.send(JSON.stringify(msg)),
    seen,
    // Use `until`, not `next`: joining already delivers an empty `vibes` frame, and waiting for "the
    // next one" returns that and asserts against a room nobody has voted in yet.
    next: async (type, from = 0) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = seen.slice(from).filter((msg) => msg.type === type);
        if (found.length > 0) return found[found.length - 1] as never;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`never received ${type}; got ${seen.map((m) => m.type).join(', ')}`);
    },
    until: async (type, predicate) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const match = seen.filter((msg) => msg.type === type).find((msg) => predicate(msg as never));
        if (match) return match as never;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`no ${type} matched; saw ${JSON.stringify(seen.filter((m) => m.type === type))}`);
    },
    close: () => socket.close(),
  };

  member.send({ type: 'join', code, displayName });
  await member.next('identity');
  return member;
}

describe('the vibe vote', () => {
  it('tells everyone the tallies and nobody the voters', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    const sam = await join(code, 'Sam');

    alex.send({ type: 'set_vibe', vibe: 'fancy' });
    sam.send({ type: 'set_vibe', vibe: 'quick' });

    // Both votes counted, rather than whichever frame happened to arrive first.
    const seenBySam = await sam.until('vibes', (msg) => Object.keys(msg.counts).length === 2);
    expect(seenBySam.counts).toEqual({ fancy: 1, quick: 1 });

    // Against the raw frames, not the parsed shape: a leak arrives as a field nobody thought to type.
    const raw = JSON.stringify(sam.seen.filter((msg) => msg.type === 'vibes'));
    expect(raw).not.toContain('Alex');
    expect(seenBySam).not.toHaveProperty('votes');
    expect(seenBySam).not.toHaveProperty('byParticipant');

    alex.close();
    sam.close();
  });

  it('hands each client its own pick and only its own', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    const sam = await join(code, 'Sam');

    alex.send({ type: 'set_vibe', vibe: 'cozy' });
    sam.send({ type: 'set_vibe', vibe: 'chaotic' });

    const settled = (member: Member) => member.until('vibes', (msg) => Object.keys(msg.counts).length === 2);
    expect((await settled(alex)).yours).toBe('cozy');
    expect((await settled(sam)).yours).toBe('chaotic');

    alex.close();
    sam.close();
  });

  it('lets somebody change their mind without double-counting them', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');

    // `until`, not `next`: joining delivers an empty vibes frame, so a length captured after the first
    // `next` can still predate the frame for the first vote. This test was flaky on exactly that.
    alex.send({ type: 'set_vibe', vibe: 'fancy' });
    await alex.until('vibes', (msg) => msg.counts.fancy === 1);
    alex.send({ type: 'set_vibe', vibe: 'quick' });

    const after = await alex.until('vibes', (msg) => msg.counts.quick === 1);
    expect(after.counts).toEqual({ quick: 1 });
    expect(after.yours).toBe('quick');

    alex.close();
  });

  it('lets somebody take it back', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    alex.send({ type: 'set_vibe', vibe: 'fancy' });
    await alex.until('vibes', (msg) => msg.counts.fancy === 1);

    alex.send({ type: 'set_vibe', vibe: null });
    const after = await alex.until('vibes', (msg) => Object.keys(msg.counts).length === 0);
    expect(after.counts).toEqual({});
    expect(after.yours).toBeNull();

    alex.close();
  });

  it('gives a late arrival the state instead of an empty dial', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    alex.send({ type: 'set_vibe', vibe: 'cozy' });
    await alex.next('vibes');

    // Sam was not in the room when the vote happened, and still has to see it.
    const sam = await join(code, 'Sam');
    const seen = await sam.next('vibes');
    expect(seen.counts).toEqual({ cozy: 1 });
    expect(seen.yours).toBeNull();

    alex.close();
    sam.close();
  });

  it('rejects a vibe that is not one of ours', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    // The schema is the door. A client is not trusted to only send the five.
    alex.send({ type: 'set_vibe', vibe: 'expensive' } as unknown as ClientMessage);
    expect((await alex.next('error')).message).toBe('Unrecognized message.');
    alex.close();
  });

  // A vote mid-round would mean two people swiping different decks. A hidden control is not a rule.
  it('ignores a vote once the round has started', async () => {
    const code = await createSession();
    const alex = await join(code, 'Alex');
    alex.send({ type: 'start_round' });
    await alex.next('deck');
    const before = alex.seen.length;

    alex.send({ type: 'set_vibe', vibe: 'chaotic' });
    // Give the room a moment to do the wrong thing before concluding that it did not.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(alex.seen.slice(before).filter((msg) => msg.type === 'vibes')).toHaveLength(0);

    alex.close();
  });
});

describe("somewhere the group has been", () => {
  it("refuses a never-again for a place they have never been to", async () => {
    /*
     * The check that stops this being a blacklist. Without it anybody holding the session code could
     * quietly shrink the deck by banning ids they made up.
     */
    const code = await createSession();
    const alex = await join(code, "Alex");
    alex.send({ type: "set_never_again", restaurantId: "never-visited", neverAgain: true });

    const history = await alex.until("history", () => true);
    expect(history.visited.every((place) => place.restaurantId !== "never-visited")).toBe(true);
    alex.close();
  });

  it("rejects a message that is not shaped like one", async () => {
    const code = await createSession();
    const alex = await join(code, "Alex");
    alex.send({ type: "set_never_again", restaurantId: "x" } as unknown as ClientMessage);
    expect((await alex.next("error")).message).toBe("Unrecognized message.");
    alex.close();
  });
});
