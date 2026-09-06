import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  applyVibe,
  blockedIds,
  resolveVibe,
  shuffleDeck,
  vibeEffectLine,
  type DemoReason,
  type Restaurant,
  type Vibe,
  type VisitedPlace,
} from "@wherever/shared";
import { createRestaurantSource, isDemoSource, MockRestaurantSource } from "./restaurantSource.js";
import { visitedPlaces } from "./db/schema.js";
import type { Env } from "./env.js";
import type { SessionMeta } from "./roomState.js";

/*
 * Where a deck comes from: the source, the budget that decides whether it is real, the vibe folded
 * into the filters, and everywhere the group has already been.
 *
 * Lifted out of SessionRoom because none of it is about a room. It reads storage and env and knows
 * nothing about sockets, which is what made it the cleanest thing to cut off a Durable Object that
 * had grown to a thousand lines.
 */

/** Everywhere this session has been, for the cooldown in revisit.ts to reason about. */
export async function visitedFor(env: Env, code: string): Promise<VisitedPlace[]> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, code));
  return rows.map((r) => ({
    restaurantId: r.restaurantId,
    name: r.name,
    visitedAt: r.visitedAt.toISOString(),
    ...(r.neverAgain ? { neverAgain: true } : {}),
  }));
}

export async function recordVisit(env: Env, code: string, restaurantId: string, name: string): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await db
    .select({ id: visitedPlaces.id })
    .from(visitedPlaces)
    .where(and(eq(visitedPlaces.sessionCode, code), eq(visitedPlaces.restaurantId, restaurantId)))
    .get();
  if (existing) return;
  await db.insert(visitedPlaces).values({ id: crypto.randomUUID(), sessionCode: code, restaurantId, name });
}

/** Whether the current deck is the sample fallback served because the live-data budget is spent. */
export async function readDemoMode(storage: DurableObjectStorage): Promise<DemoReason | undefined> {
  /* Stored as a reason since the deck was fetched. `null` for a real deck, and `true` for a room
     whose deck predates this field, which was only ever set for the budget case. */
  const held = await storage.get<DemoReason | boolean | null>("demoMode");
  if (held === true) return "budget";
  return held === null || held === false ? undefined : held;
}

interface DeckRequest {
  storage: DurableObjectStorage;
  env: Env;
  meta: SessionMeta;
  /** Tallied by the caller, which owns the votes; this module only reads the winner out of them. */
  vibeCounts: Partial<Record<Vibe, number>>;
  exclude?: ReadonlySet<string>;
}

/** Fetch from the source, drop anything the group already picked, cache it. */
export async function fetchFreshDeck({
  storage,
  env,
  meta,
  vibeCounts,
  exclude = new Set(),
}: DeckRequest): Promise<Restaurant[]> {
  const kind = env.RESTAURANT_SOURCE ?? "mock";
  const apiKey = kind === "google" ? env.GOOGLE_PLACES_API_KEY : undefined;

  // A real Google search is about to happen → charge it against the monthly budget first. If the
  // budget is spent, don't call Google: fall back to the sample deck so the app stays playable as
  // a demo, and flag it so the client can explain why the data is stand-in.
  let source;
  let demo: DemoReason | undefined;
  if (kind === "google" && apiKey) {
    const meter = env.USAGE_METER.get(env.USAGE_METER.idFromName("global"));
    if (await meter.tryConsume("search")) {
      source = createRestaurantSource(kind, apiKey, env.PUBLIC_API_BASE);
    } else {
      source = new MockRestaurantSource();
      demo = "budget";
    }
  } else {
    source = createRestaurantSource(kind, apiKey, env.PUBLIC_API_BASE);
    // Same flag the spent-budget path sets: whatever the reason, the room is being told these
    // places are stand-ins rather than being left to assume they are real.
    demo = isDemoSource(kind, apiKey) ? "sample" : undefined;
  }

  /*
   * The vibe, folded into the filters the deck is actually fetched with, and saved onto the session so
   * the summary everyone is reading describes the deck they were dealt. No vibe changes nothing, which
   * is why it is opt-in.
   */
  const reading = resolveVibe(vibeCounts);
  if (reading.vibe) {
    // Describe the change before making it: applyVibe overwrites the very filters it is measured
    // against, and this is the only place both halves exist.
    await storage.put("vibeEffect", vibeEffectLine(reading.vibe, meta.filters));
    meta.filters = applyVibe(meta.filters, reading.vibe);
    await storage.put("meta", meta);
  } else {
    await storage.delete("vibeEffect");
  }

  const all = await source.fetchDeck(meta.filters);
  /* Everywhere the group has been, minus the ones whose cooldown expired. Excluding them forever meant
     a group that actually used the app shrank its own deck one dinner at a time. See revisit.ts. */
  const blocked = blockedIds(await visitedFor(env, meta.code));
  const filtered = all.filter((r) => !blocked.has(r.id) && !exclude.has(r.id));
  // Seeded on the code so the same session always deals the same chaos, which is debuggable.
  const deck = meta.filters.shuffle ? shuffleDeck(filtered, meta.code) : filtered;
  await storage.put("deck", deck);
  await storage.put("demoMode", demo ?? null);
  return deck;
}

export async function getOrCreateDeck(request: DeckRequest): Promise<Restaurant[]> {
  const cached = await request.storage.get<Restaurant[]>("deck");
  return cached ?? fetchFreshDeck(request);
}
