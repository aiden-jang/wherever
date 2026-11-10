import type { DecisionResult, Restaurant, SessionFilters } from "@wherever/shared";
import type { Env } from "./env.js";
import { GooglePlacesRestaurantSource } from "./restaurantSource.js";

const DISPLAY_UNAVAILABLE = "Restaurant details unavailable";

export function googlePlaceListing(id: string) {
  return `https://www.google.com/maps/search/?api=1&query=restaurant&query_place_id=${encodeURIComponent(id)}`;
}

export function storedPlace(place: Restaurant): Restaurant {
  if (place.source !== "google") return place;
  return {
    id: place.id,
    source: "google",
    detailsStatus: "unavailable",
    name: DISPLAY_UNAVAILABLE,
    category: "Restaurant",
    priceTier: 2,
    priceUnknown: true,
    distanceMeters: 0,
    rating: null,
    reviewCount: null,
    address: null,
    imageUrl: null,
    googleMapsUri: googlePlaceListing(place.id),
  };
}

export function storedVerdict(result: DecisionResult): DecisionResult {
  return {
    ...result,
    restaurant: storedPlace(result.restaurant),
    alternatives: (result.alternatives ?? []).map((choice) => ({
      ...choice,
      restaurant: storedPlace(choice.restaurant),
    })),
  };
}

/** Remove older full-place snapshots when a live-data room is opened after deployment. */
export async function scrubLegacyPlaces(storage: DurableObjectStorage, env: Env): Promise<void> {
  if (env.RESTAURANT_SOURCE !== "google" || !env.GOOGLE_PLACES_API_KEY) return;
  await storage.transaction(async (transaction) => {
    if (await transaction.get("demoMode")) return;
    const compact = (place: Restaurant) => storedPlace({ ...place, source: "google" });
    for (const key of ["deck", "reserve"]) {
      const places = await transaction.get<Restaurant[]>(key);
      if (
        places?.length &&
        places.some((place) => !place.id.startsWith("mock-") && place.name !== DISPLAY_UNAVAILABLE)
      ) {
        await transaction.put(key, places.map(compact));
      }
    }
    const result = await transaction.get<DecisionResult | null>("winner");
    if (
      result &&
      !result.restaurant.id.startsWith("mock-") &&
      result.restaurant.name !== DISPLAY_UNAVAILABLE
    ) {
      await transaction.put("winner", {
        ...result,
        restaurant: compact(result.restaurant),
        alternatives: (result.alternatives ?? []).map((choice) => ({
          ...choice,
          restaurant: compact(choice.restaurant),
        })),
      });
    }
  });
}

/** Working display data for the active object. Durable storage retains Google IDs only. */
export class RoomPlaces {
  private current = new Map<string, Restaurant>();
  private pending = new Map<string, Promise<Restaurant>>();
  private failedUntil = new Map<string, number>();

  constructor(private readonly env: Env) {}

  remember(places: Restaurant[]): void {
    this.failedUntil.clear();
    for (const place of places) if (place.source === "google") this.cache(place);
  }

  private cache(place: Restaurant) {
    this.current.delete(place.id);
    this.current.set(place.id, place);
    if (this.current.size > 25) this.current.delete(this.current.keys().next().value!);
  }

  name(id: string): string | undefined {
    return this.current.get(id)?.name;
  }

  forDeck(place: Restaurant): Restaurant {
    if (place.source !== "google") return place;
    const held = this.current.get(place.id);
    if (
      held &&
      (held.availabilityCheckedAt === undefined || Date.now() - held.availabilityCheckedAt < 300_000)
    )
      return held;
    const fallback = storedPlace(place);
    return Date.now() < (this.failedUntil.get(place.id) ?? 0)
      ? fallback
      : { ...fallback, detailsStatus: "pending" };
  }

  async show(place: Restaurant, filters: SessionFilters): Promise<Restaurant> {
    const cached = this.forDeck(place);
    if (cached.detailsStatus !== "pending") return cached;
    const pending = this.pending.get(place.id);
    if (pending) return pending;
    const lookup = this.load(storedPlace(place), filters)
      .then((result) => {
        if (result.detailsStatus === "unavailable") this.failedUntil.set(place.id, Date.now() + 60_000);
        return result;
      })
      .finally(() => this.pending.delete(place.id));
    this.pending.set(place.id, lookup);
    return lookup;
  }

  async showDeck(deck: Restaurant[], filters: SessionFilters): Promise<Restaurant[]> {
    return Promise.all(deck.map((place) => this.show(place, filters)));
  }

  async showVerdict(result: DecisionResult, filters: SessionFilters): Promise<DecisionResult> {
    const [restaurant, alternatives] = await Promise.all([
      this.show(result.restaurant, filters),
      Promise.all(
        (result.alternatives ?? []).map(async (choice) => ({
          ...choice,
          restaurant: await this.show(choice.restaurant, filters),
        })),
      ),
    ]);
    return { ...result, restaurant, alternatives };
  }

  private async load(place: Restaurant, filters: SessionFilters): Promise<Restaurant> {
    const key = this.env.GOOGLE_PLACES_API_KEY;
    if (!key) return place;
    const meter = this.env.USAGE_METER.get(this.env.USAGE_METER.idFromName("global"));
    try {
      if (!(await meter.tryConsume("search"))) return place;
      const source = new GooglePlacesRestaurantSource(key, this.env.PUBLIC_API_BASE);
      const fresh = await source.fetchPlace(place.id, filters);
      if (!fresh) return place;
      this.cache(fresh);
      return fresh;
    } catch {
      return place;
    }
  }
}
