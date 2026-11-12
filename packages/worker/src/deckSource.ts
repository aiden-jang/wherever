import { writeEvent } from "./events.js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  blockedIds,
  radiusLabel,
  resolveVibe,
  shuffleDeck,
  vibeOption,
  widerRadius,
  type DemoReason,
  type Restaurant,
  type SessionFilters,
  type Vibe,
  type VisitedPlace,
} from "@wherever/shared";
import { createRestaurantSource, isDemoSource, MockRestaurantSource } from "./restaurantSource.js";

import { visitedPlaces } from "./db/schema.js";
import type { Env } from "./env.js";
import type { SessionMeta } from "./roomState.js";
import { googlePlaceListing, storedPlace, type RoomPlaces } from "./roomPlaces.js";
import { assertRoomLive, ExpiredRoomError, putLive, SESSION_TTL_MS } from "./sessionRetention.js";

/* Deck sourcing combines the provider, monthly search budget, vibe filters, and visited history. It does not own sockets. */

/** Everywhere this session has been, for the cooldown in revisit.ts to reason about. */
export async function visitedFor(env: Env, code: string): Promise<VisitedPlace[]> {
  const db = drizzle(env.DB);
  const rows = await db.select().from(visitedPlaces).where(eq(visitedPlaces.sessionCode, code));
  if (
    env.RESTAURANT_SOURCE === "google" &&
    env.GOOGLE_PLACES_API_KEY &&
    rows.some((row) => row.name && !row.restaurantId.startsWith("mock-"))
  ) {
    await env.DB.prepare(
      "UPDATE visited_places SET name = '' WHERE session_code = ? AND restaurant_id NOT LIKE 'mock-%'",
    )
      .bind(code)
      .run();
    for (const row of rows) if (!row.restaurantId.startsWith("mock-")) row.name = "";
  }
  return rows.map((r) => ({
    restaurantId: r.restaurantId,
    name: r.name,
    visitedAt: r.visitedAt.toISOString(),
    ...(r.neverAgain ? { neverAgain: true } : {}),
  }));
}

export async function presentHistory(env: Env, code: string, places: RoomPlaces): Promise<VisitedPlace[]> {
  const visited = await visitedFor(env, code);
  visited.sort(
    (a, b) => a.visitedAt.localeCompare(b.visitedAt) || a.restaurantId.localeCompare(b.restaurantId),
  );
  return visited.map((entry, index) => ({
    ...entry,
    name: entry.name || places.name(entry.restaurantId) || `Past pick ${index + 1}`,
    ...(!entry.name ? { mapsUrl: googlePlaceListing(entry.restaurantId) } : {}),
  }));
}

export async function recordVisit(env: Env, code: string, restaurantId: string, name: string): Promise<void> {
  const db = drizzle(env.DB);
  const existing = await db
    .select({ id: visitedPlaces.id })
    .from(visitedPlaces)
    .where(and(eq(visitedPlaces.sessionCode, code), eq(visitedPlaces.restaurantId, restaurantId)))
    .get();
  if (existing) {
    await db
      .update(visitedPlaces)
      .set({ visitedAt: new Date(), name })
      .where(eq(visitedPlaces.id, existing.id));
    return;
  }
  await env.DB.prepare(
    "INSERT INTO visited_places(id,session_code,restaurant_id,name) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE code=? AND created_at>?)",
  )
    .bind(
      crypto.randomUUID(),
      code,
      restaurantId,
      name,
      code,
      Math.floor((Date.now() - SESSION_TTL_MS) / 1000),
    )
    .run();
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
  places?: RoomPlaces;
}

/** Fetch from the source, drop anything the group already picked, cache it. */
export async function fetchFreshDeck({
  storage,
  env,
  meta,
  vibeCounts,
  exclude = new Set(),
  places,
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

  const reading = resolveVibe(vibeCounts);
  const preference = reading.vibe ? vibeOption(reading.vibe) : undefined;
  const filters = meta.filters;

  await assertRoomLive(storage);
  const results = await source.fetchDeck(filters);
  const all = preference
    ? [...results].sort(
        (a, b) => preferenceScore(b, preference.filters) - preferenceScore(a, preference.filters),
      )
    : results;
  // Fresh rounds skip earlier picks. Same-deck replay handles explicit exclusions separately.
  const blocked = blockedIds(await visitedFor(env, meta.code));
  /* Every card this session has already been dealt, not just the deck in hand. The reserve means a
     later fetch would otherwise offer round one's places back as new ones. */
  return storage
    .transaction(async (transaction) => {
      await assertRoomLive(transaction);
      const seen = new Set((await transaction.get<string[]>("seenIds")) ?? []);
      const filtered = all.filter((r) => !blocked.has(r.id) && !exclude.has(r.id) && !seen.has(r.id));
      const ordered = filters.shuffle ? shuffleDeck(filtered, meta.code) : filtered;
      const deck = ordered.slice(0, ROUND_SIZE);
      if (deck.length === 0) return deck;
      for (const restaurant of deck) seen.add(restaurant.id);
      await transaction.put({
        deck: deck.map(storedPlace),
        reserve: ordered.slice(ROUND_SIZE).map(storedPlace),
        seenIds: [...seen],
        demoMode: demo ?? null,
        vibeEffect: preference ? `Group preference: ${preference.label}. Your filters still apply.` : null,
      });
      return deck;
    })
    .then((deck) => {
      if (deck.length) places?.remember(all);
      return deck;
    });
}

async function rememberDealt(storage: DurableObjectStorage, deck: Restaurant[]): Promise<void> {
  const seen = new Set((await storage.get<string[]>("seenIds")) ?? []);
  for (const r of deck) seen.add(r.id);
  await putLive(storage, { seenIds: [...seen] });
}

const spentLine = (meters: number) =>
  `No new places turned up within ${radiusLabel(meters)}. Try the same places or start a room in another area.`;

function preferenceScore(place: Restaurant, preference: Partial<SessionFilters>): number {
  return (
    Number(preference.priceTiers?.includes(place.priceTier) ?? false) +
    Number(preference.radiusMeters !== undefined && place.distanceMeters <= preference.radiusMeters) +
    Number(preference.minRating !== undefined && (place.rating ?? 0) >= preference.minRating) +
    Number(preference.openNow === true && place.openNow === true) +
    (preference.amenities?.filter((amenity) => place.amenities?.[amenity]).length ?? 0)
  );
}

export async function nextRoundDeck(
  request: DeckRequest,
  canPay: boolean,
): Promise<{ deck: Restaurant[]; paid: boolean; note?: string } | { error: string }> {
  const blocked = blockedIds(await visitedFor(request.env, request.meta.code));
  const held = await dealFromReserve(request.storage, blocked);
  if (held) {
    const deck = request.places
      ? await Promise.all(held.map((place) => request.places!.show(place, request.meta.filters)))
      : held;
    return { deck, paid: false };
  }
  if (!canPay)
    return { error: "This room has reached its search limit. Vote on the same places or create a new room." };

  const from = (await request.storage.get<number>("lastSearchRadius")) ?? request.meta.filters.radiusMeters;
  const wider = widerRadius(from);
  if (wider === null) {
    writeEvent(request.env, "run_it_back_spent");
    return { error: spentLine(from) };
  }
  writeEvent(request.env, "run_it_back", String(wider));
  const meta = { ...request.meta, filters: { ...request.meta.filters, radiusMeters: wider } };
  let deck: Restaurant[];
  try {
    deck = await fetchFreshDeck({ ...request, meta });
  } catch (error) {
    if (error instanceof ExpiredRoomError) throw error;
    console.error("restaurant_deck_failed", error);
    return { error: "Couldn’t load more places. Try again in a moment." };
  }
  await putLive(request.storage, { lastSearchRadius: wider });
  if (deck.length === 0) return { error: spentLine(wider) };
  request.meta.filters = meta.filters;
  return { deck, paid: true, note: `Expanded the search to ${radiusLabel(wider)}.` };
}

/** The overflow from the last fetch: a free round, already paid for. */
async function dealFromReserve(
  storage: DurableObjectStorage,
  blocked: ReadonlySet<string>,
): Promise<Restaurant[] | null> {
  const reserve = ((await storage.get<Restaurant[]>("reserve")) ?? []).filter(
    (place) => !blocked.has(place.id),
  );
  // A round of one or two is worse than saying the area is spent, so a thin reserve is not dealt.
  if (reserve.length < MIN_ROUND) return null;
  const deck = reserve.slice(0, ROUND_SIZE);
  await putLive(storage, { deck, reserve: reserve.slice(ROUND_SIZE) });
  await rememberDealt(storage, deck);
  return deck;
}

export async function readDeck(storage: DurableObjectStorage): Promise<Restaurant[]> {
  return (await storage.get<Restaurant[]>("deck")) ?? [];
}
