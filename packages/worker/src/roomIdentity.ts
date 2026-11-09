import type { ClientMap, SocketAttachment } from "./roomState.js";
import { assertRoomLive } from "./sessionRetention.js";

export async function resolveIdentity(
  storage: DurableObjectStorage,
  clientId?: string,
): Promise<Pick<SocketAttachment, "participantId" | "isHost"> | "unowned" | null> {
  return storage.transaction(async (transaction) => {
    await assertRoomLive(transaction);
    const hostId = await transaction.get<string>("hostId");
    if (!hostId) return "unowned";
    const map = (await transaction.get<ClientMap>("clientMap")) ?? {};
    const prior = clientId && Object.hasOwn(map, clientId) ? map[clientId] : undefined;
    const anonymous = (await transaction.get<number>("anonymousSeats")) ?? 0;
    if (!prior && Object.keys(map).length + anonymous >= 100) return null;
    const participantId = prior?.participantId || crypto.randomUUID();
    const isHost = hostId === participantId;
    const identity = { participantId, isHost };
    await transaction.put<unknown>({
      ...(clientId ? { clientMap: { ...map, [clientId]: identity } } : { anonymousSeats: anonymous + 1 }),
    });
    return identity;
  });
}
