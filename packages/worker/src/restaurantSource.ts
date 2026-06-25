import type { PriceTier, Restaurant, SessionFilters } from "@wherever/shared";

/**
 * The boundary between the app and wherever restaurants come from. Swap the
 * implementation without touching the rest of the Worker.
 */
export interface RestaurantSource {
  fetchDeck(filters: SessionFilters): Promise<Restaurant[]>;
}

const MOCK_DECK: Restaurant[] = [
  { id: "mock-1", name: "The Usual", category: "Burgers", priceTier: 2, rating: 4.3, distanceMeters: 400, imageUrl: null, address: "12 Main St" },
  { id: "mock-2", name: "Probably Fine Tacos", category: "Tacos", priceTier: 1, rating: 4.6, distanceMeters: 750, imageUrl: null, address: "88 2nd Ave" },
  { id: "mock-3", name: "Noodle Situation", category: "Ramen", priceTier: 2, rating: 4.1, distanceMeters: 1100, imageUrl: null, address: "5 Bowl Ln" },
  { id: "mock-4", name: "Salad, I Guess", category: "Healthy", priceTier: 2, rating: 3.9, distanceMeters: 300, imageUrl: null, address: "200 Green St" },
  { id: "mock-5", name: "Late Night Pizza Decisions", category: "Pizza", priceTier: 1, rating: 4.4, distanceMeters: 950, imageUrl: null, address: "1 Slice Blvd" },
];

/** Returns seeded data, filtered just enough to behave like the real thing. */
export class MockRestaurantSource implements RestaurantSource {
  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    return MOCK_DECK.filter((r) => {
      if (r.priceTier > filters.maxPriceTier) return false;
      if (r.distanceMeters > filters.radiusMeters) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(r.category)) {
        return false;
      }
      return true;
    });
  }
}

// ---- Foursquare ----

/** Subset of a Foursquare place we care about (Places API, 2025 surface). */
export interface FoursquarePlace {
  fsq_place_id: string;
  name: string;
  location?: { address?: string; formatted_address?: string };
  categories?: { name: string }[];
  distance?: number;
  price?: number;
  rating?: number;
  photos?: { prefix: string; suffix: string }[];
}

function clampTier(n: number): PriceTier {
  return Math.min(4, Math.max(1, Math.round(n))) as PriceTier;
}

/** Pure mapping from a Foursquare place to our domain shape. Unit-tested. */
export function mapFoursquarePlace(p: FoursquarePlace): Restaurant {
  const photo = p.photos?.[0];
  return {
    id: p.fsq_place_id,
    name: p.name,
    category: p.categories?.[0]?.name ?? "Food",
    priceTier: clampTier(p.price ?? 2),
    // Foursquare rates 0-10; our UI shows a 0-5 star scale.
    rating: p.rating != null ? Math.round((p.rating / 2) * 10) / 10 : null,
    distanceMeters: p.distance ?? 0,
    imageUrl: photo ? `${photo.prefix}original${photo.suffix}` : null,
    address: p.location?.address ?? p.location?.formatted_address ?? null,
  };
}

// Fallback search center when the host did not share a location (e.g. denied
// geolocation). Foursquare requires an `ll`; this keeps the app functional.
const DEFAULT_LL = "40.7128,-74.0060"; // NYC

export class FoursquareRestaurantSource implements RestaurantSource {
  constructor(private readonly apiKey: string) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const ll =
      filters.lat != null && filters.lng != null
        ? `${filters.lat},${filters.lng}`
        : DEFAULT_LL;

    const params = new URLSearchParams({
      ll,
      radius: String(filters.radiusMeters),
      max_price: String(filters.maxPriceTier),
      limit: "50",
      query: filters.categories.length ? filters.categories.join(" ") : "restaurant",
      fields: "fsq_place_id,name,location,categories,distance,price,rating,photos",
    });

    const res = await fetch(
      `https://places-api.foursquare.com/places/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Places-Api-Version": "2025-06-17",
          accept: "application/json",
        },
      },
    );
    // Fail soft: an API hiccup shows "nothing nearby" rather than crashing.
    if (!res.ok) return [];

    const data = (await res.json()) as { results?: FoursquarePlace[] };
    return (data.results ?? [])
      .filter((p) => p.fsq_place_id && p.name)
      .map(mapFoursquarePlace);
  }
}

export function createRestaurantSource(
  kind: string,
  apiKey?: string,
): RestaurantSource {
  switch (kind) {
    case "foursquare":
      if (apiKey) return new FoursquareRestaurantSource(apiKey);
      // No key configured: degrade to mock instead of failing.
      return new MockRestaurantSource();
    case "mock":
    default:
      return new MockRestaurantSource();
  }
}
