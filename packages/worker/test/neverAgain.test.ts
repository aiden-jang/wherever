import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '@wherever/shared';

/*
 * "never again" is permanent and group-wide: it keeps a place out of every future deck for this
 * session. It was the one mutating message that never looked at who was asking.
 */

const BASE = 'https://wherever.test';

async function createSession(): Promise<string> {
  const res = await SELF.fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: 'Alex', filters: { radiusMeters: 5000, maxPriceTier: 3, categories: [] } }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

async function connect(code: string) {
  const res = await SELF.fetch(`${BASE}/ws/${code}`, { headers: { Upgrade: 'websocket' } });
  const socket = res.webSocket;
  if (!socket) throw new Error(`no socket (status ${res.status})`);
  socket.accept();
  const seen: ServerMessage[] = [];
  socket.addEventListener('message', (e) => seen.push(JSON.parse(e.data as string) as ServerMessage));
  const send = (msg: ClientMessage) => socket.send(JSON.stringify(msg));
  const waitFor = async (type: ServerMessage['type']) => {
    for (let i = 0; i < 100; i += 1) {
      const hit = seen.filter((m) => m.type === type).pop();
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 10));
    }
    return undefined;
  };
  return { send, seen, waitFor, close: () => socket.close() };
}

describe('marking a place never again', () => {
  it('ignores a socket that never joined', async () => {
    const code = await createSession();
    // Opened the socket, skipped the join. It has no identity, so it is nobody in this session.
    const stranger = await connect(code);

    stranger.send({ type: 'set_never_again', restaurantId: 'anything', neverAgain: true });

    // The handler broadcasts history on success, so a history frame here means it went through.
    await new Promise((r) => setTimeout(r, 250));
    expect(stranger.seen.filter((m) => m.type === 'history')).toEqual([]);
    stranger.close();
  });

  it('lets anyone who actually joined set it, not just the host', async () => {
    const code = await createSession();
    const host = await connect(code);
    host.send({ type: 'join', code, displayName: 'Alex' });
    await host.waitFor('identity');

    const guest = await connect(code);
    guest.send({ type: 'join', code, displayName: 'Sam' });
    await guest.waitFor('identity');

    const before = guest.seen.length;
    guest.send({ type: 'set_never_again', restaurantId: 'somewhere', neverAgain: true });

    // It is the group's memory, so a guest may set it; the reply is a history broadcast either way.
    for (let i = 0; i < 100 && guest.seen.length === before; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(guest.seen.slice(before).some((m) => m.type === 'history')).toBe(true);
    host.close();
    guest.close();
  });
});
