import type { SessionFilters } from "@wherever/shared";
import type { SessionMeta } from "./roomState.js";
import { assertRoomLive } from "./sessionRetention.js";

/** Keep deliberate host edits when another group preset replaces the current one. */
function editedFilterBase(
  base: SessionFilters,
  previous: SessionFilters,
  next: SessionFilters,
): SessionFilters {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)] as (keyof SessionFilters)[]);
  const changed = [...keys].filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return { ...base, ...Object.fromEntries(changed.map((key) => [key, next[key]])) };
}

export async function saveRoomFilters(storage: DurableObjectStorage, filters: SessionFilters): Promise<void> {
  await storage.transaction(async (transaction) => {
    await assertRoomLive(transaction);
    const meta = await transaction.get<SessionMeta>("meta");
    if (!meta || meta.status !== "lobby") return;
    const base = await transaction.get<SessionFilters | null>("vibeFilterBase");
    await transaction.put({
      meta: { ...meta, filters },
      ...(base ? { vibeFilterBase: editedFilterBase(base, meta.filters, filters) } : {}),
    });
  });
}
