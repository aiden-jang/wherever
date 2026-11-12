import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "@wherever/shared";
import { restoreVibeFilters, setVibe } from "../src/vibeTally.js";
import { saveRoomFilters } from "../src/vibeFilters.js";
import type { SessionMeta } from "../src/roomState.js";

function room() {
  const base = { ...DEFAULT_FILTERS, area: "west-village", categories: ["pizza"], openNow: false };
  const values = new Map<string, unknown>([["meta", { status: "lobby", filters: base }]]);
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value));
    },
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => callback(storage),
  } as unknown as DurableObjectStorage;
  const filters = () => (values.get("meta") as SessionMeta).filters;
  return { storage, filters, base };
}
describe("room preference filters", () => {
  it("restores a persisted preference from before presets without resetting later host edits on reconnect", async () => {
    const { storage, filters } = room();
    await storage.put({ vibes: { guest: "fancy" } });
    await restoreVibeFilters(storage);
    expect(filters().radiusMeters).toBe(4000);
    await saveRoomFilters(storage, { ...filters(), radiusMeters: 4800 });
    await restoreVibeFilters(storage);
    expect(filters().radiusMeters).toBe(4800);
  });
  it("applies the group's winner and replaces the previous preset without leaking its restrictions", async () => {
    const { storage, filters } = room();
    await setVibe(storage, "guest", "quick");
    expect(filters()).toMatchObject({
      radiusMeters: 800,
      priceTiers: [1, 2],
      openNow: true,
      amenities: ["takeout"],
      categories: ["pizza"],
      area: "west-village",
    });
    await setVibe(storage, "guest", "fancy");
    expect(filters()).toMatchObject({
      radiusMeters: 4000,
      minRating: 4.4,
      priceTiers: [3, 4],
      amenities: ["reservable"],
      openNow: false,
    });
    expect(filters().sort).not.toBe("distance");
  });
  it("keeps manual host edits while extra votes keep the same preset ahead", async () => {
    const { storage, filters } = room();
    await setVibe(storage, "host", "quick");
    await saveRoomFilters(storage, { ...filters(), radiusMeters: 4800 });
    await setVibe(storage, "guest", "quick");
    expect(filters().radiusMeters).toBe(4800);
  });
  it("clears the final preference back to the base with subsequent host edits preserved", async () => {
    const { storage, filters, base } = room();
    await setVibe(storage, "guest", "chaotic");
    await saveRoomFilters(storage, { ...filters(), categories: ["ramen"], roundSeconds: 60 });
    await setVibe(storage, "guest", "quick");
    expect(filters().shuffle).toBe(base.shuffle);
    await setVibe(storage, "guest", null);
    expect(filters()).toEqual({ ...base, categories: ["ramen"], roundSeconds: 60 });
  });
  it("uses the group tally rather than the last person's selection", async () => {
    const { storage, filters } = room();
    await setVibe(storage, "host", "fancy");
    await setVibe(storage, "guest", "quick");
    expect(filters().minRating).toBe(4.4);
    await setVibe(storage, "third", "quick");
    expect(filters().radiusMeters).toBe(800);
    expect(filters().minRating).toBe(DEFAULT_FILTERS.minRating);
  });
  it("rejects expired writes and leaves an active round's filters alone", async () => {
    const { storage, filters, base } = room();
    await storage.put({ meta: { status: "swiping", filters: base } });
    await setVibe(storage, "guest", "quick");
    await saveRoomFilters(storage, { ...base, radiusMeters: 800 });
    expect(filters()).toEqual(base);
    await storage.put({ expired: true });
    await expect(setVibe(storage, "guest", "quick")).rejects.toThrow();
  });
});
