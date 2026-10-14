import { writeEvent } from "./events.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  applyVibe,
  blockedIds,
  radiusLabel,
  resolveVibe,
  shuffleDeck,
  vibeEffectLine,
  widerRadius,
  type DemoReason,
  type Restaurant,
  type Vibe,
  type VisitedPlace,
} from "@wherever/shared";
import { createRestaurantSource, isDemoSource, MockRestaurantSource } from "./restaurantSource.js";

import { visitedPlaces } from "./db/schema.js";
import type { Env } from "./env.js";
import type { SessionMeta } from "./roomState.js";

/* Deck sourcing combines the provider, monthly search budget, vibe filters, and visited history. It does not own sockets. */

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

/* One round's worth. Nearby Search caps out at 20 places, so dealing every one of them in round one
   leaves nothing for a second, and twenty cards is a long sit besides. */
const ROUND_SIZE = 10;
const MIN_ROUND = 3;

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
  /* Every card this session has already been dealt, not just the deck in hand. The reserve means a
     later fetch would otherwise offer round one's places back as new ones. */
  const seen = new Set((await storage.get<string[]>("seenIds")) ?? []);
  const filtered = all.filter((r) => !blocked.has(r.id) && !exclude.has(r.id) && !seen.has(r.id));
  // Seeded on the code so the same session always deals the same chaos, which is debuggable.
  const ordered = meta.filters.shuffle ? shuffleDeck(filtered, meta.code) : filtered;
  const deck = ordered.slice(0, ROUND_SIZE);
  await storage.put("deck", deck);
  await storage.put("reserve", ordered.slice(ROUND_SIZE));
  await rememberDealt(storage, deck);
  await storage.put("demoMode", demo ?? null);
  return deck;
}

async function rememberDealt(storage: DurableObjectStorage, deck: Restaurant[]): Promise<void> {
  const seen = new Set((await storage.get<string[]>("seenIds")) ?? []);
  for (const r of deck) seen.add(r.id);
  await storage.put("seenIds", [...seen]);
}

const spentLine = (meters: number) =>
  `That's everywhere within ${radiusLabel(meters)}, picked clean. Start a fresh session somewhere else.`;

/* `canPay` is asked only once the reserve is gone: the cap counts paid fetches, and a reserve round
   is not one. */
export async function nextRoundDeck(
  request: DeckRequest,
  canPay: boolean,
): Promise<{ deck: Restaurant[]; paid: boolean; note?: string } | { error: string }> {
  const held = await dealFromReserve(request.storage);
  if (held) return { deck: held, paid: false };
  if (!canPay) return { error: "you've been through a lot of rounds. start a fresh session to keep going." };

  /* Widen before the call, not after a disappointing one. An empty reserve means every place this
     radius returns has been dealt, so the same query provably cannot find anything new. */
  const from = request.meta.filters.radiusMeters;
  const wider = widerRadius(from);
  if (wider === null) {
    writeEvent(request.env, "run_it_back_spent");
    return { error: spentLine(from) };
  }
  writeEvent(request.env, "run_it_back", String(wider));
  /* Kept even when the wider search also comes up empty, so the next attempt steps further out
     instead of paying again for the radius that just failed. The caller broadcasts either way. */
  request.meta.filters = { ...request.meta.filters, radiusMeters: wider };
  await request.storage.put("meta", request.meta);

  let deck: Restaurant[];
  // Fetch BEFORE the caller tears down the current result, or a picked-clean area leaves a late
  // joiner on a null winner being told nobody liked anything.
  try {
    deck = await fetchFreshDeck(request);
  } catch {
    return { error: "couldn't load more spots right now. give it a moment and try again." };
  }
  if (deck.length === 0) return { error: spentLine(wider) };
  const note = `Nothing new within ${radiusLabel(from)}, so the search went out to ${radiusLabel(wider)}.`;
  return { deck, paid: true, note };
}

/** The overflow from the last fetch: a free round, already paid for. */
export async function dealFromReserve(storage: DurableObjectStorage): Promise<Restaurant[] | null> {
  const reserve = (await storage.get<Restaurant[]>("reserve")) ?? [];
  // A round of one or two is worse than saying the area is spent, so a thin reserve is not dealt.
  if (reserve.length < MIN_ROUND) return null;
  const deck = reserve.slice(0, ROUND_SIZE);
  await storage.put("deck", deck);
  await storage.put("reserve", reserve.slice(ROUND_SIZE));
  await rememberDealt(storage, deck);
  return deck;
}

export async function getOrCreateDeck(request: DeckRequest): Promise<Restaurant[]> {
  const cached = await request.storage.get<Restaurant[]>("deck");
  return cached ?? fetchFreshDeck(request);
}
