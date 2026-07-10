import type { PriceTier, Restaurant, SessionFilters } from "@wherever/shared";
import { googleTypeFor, NEIGHBORHOODS } from "@wherever/shared";

// Fallback center when the host neither picked an area nor shared a location; keeps the app
// functional. NYC, matching the neighborhood set.
const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };

/**
 * Resolve the search center: a picked neighborhood wins, then the host's shared location, then
 * the default. Exported for unit testing.
 */
export function resolveSearchCenter(filters: SessionFilters): { lat: number; lng: number } {
  if (filters.area) {
    const n = NEIGHBORHOODS.find((x) => x.value === filters.area);
    if (n) return { lat: n.lat, lng: n.lng };
  }
  if (filters.lat != null && filters.lng != null) {
    return { lat: filters.lat, lng: filters.lng };
  }
  return DEFAULT_CENTER;
}

/**
 * The boundary between the app and wherever restaurants come from. Swap the
 * implementation without touching the rest of the Worker.
 */
export interface RestaurantSource {
  fetchDeck(filters: SessionFilters): Promise<Restaurant[]>;
}

/**
 * Client-side rating gate, shared by every source (no provider filters by rating server-side).
 * A minRating of 0/undefined lets everything through; otherwise an unrated place is dropped,
 * since we can't confirm it clears the bar.
 */
export function passesRating(rating: number | null, minRating?: number): boolean {
  if (!minRating) return true;
  return rating != null && rating >= minRating;
}

/**
 * Minimum-review-count gate. Like passesRating: 0/undefined lets everything through, otherwise a
 * place with an unknown count is dropped since we can't confirm it clears the bar.
 */
export function passesReviews(reviewCount: number | null, minReviews?: number): boolean {
  if (!minReviews) return true;
  return reviewCount != null && reviewCount >= minReviews;
}

const MOCK_DECK: Restaurant[] = [
  { id: "mock-1", name: "The Usual", category: "Burgers", priceTier: 2, rating: 4.3, reviewCount: 820, distanceMeters: 400, imageUrl: null, address: "12 Main St" },
  { id: "mock-2", name: "Probably Fine Tacos", category: "Tacos", priceTier: 1, rating: 4.6, reviewCount: 1540, distanceMeters: 750, imageUrl: null, address: "88 2nd Ave" },
  { id: "mock-3", name: "Noodle Situation", category: "Ramen", priceTier: 2, rating: 4.1, reviewCount: 210, distanceMeters: 1100, imageUrl: null, address: "5 Bowl Ln" },
  { id: "mock-4", name: "Salad, I Guess", category: "Healthy", priceTier: 2, rating: 3.9, reviewCount: 47, distanceMeters: 300, imageUrl: null, address: "200 Green St" },
  { id: "mock-5", name: "Late Night Pizza Decisions", category: "Pizza", priceTier: 1, rating: 4.4, reviewCount: 3020, distanceMeters: 950, imageUrl: null, address: "1 Slice Blvd" },
];

/** Returns seeded data, filtered just enough to behave like the real thing. */
export class MockRestaurantSource implements RestaurantSource {
  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    // Mock data has no opening hours, so the openNow filter is a no-op here (all treated as open).
    return MOCK_DECK.filter((r) => {
      if (r.priceTier > filters.maxPriceTier) return false;
      if (r.distanceMeters > filters.radiusMeters) return false;
      if (!passesRating(r.rating, filters.minRating)) return false;
      if (!passesReviews(r.reviewCount, filters.minReviews)) return false;
      if (
        filters.categories.length > 0 &&
        !filters.categories.some((c) => c.toLowerCase() === r.category.toLowerCase())
      ) {
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
    // The search fields we request don't include a rating count.
    reviewCount: null,
    distanceMeters: p.distance ?? 0,
    imageUrl: photo ? `${photo.prefix}original${photo.suffix}` : null,
    address: p.location?.address ?? p.location?.formatted_address ?? null,
  };
}

export class FoursquareRestaurantSource implements RestaurantSource {
  constructor(private readonly apiKey: string) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const center = resolveSearchCenter(filters);
    const ll = `${center.lat},${center.lng}`;

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
      .map(mapFoursquarePlace)
      .filter((r) => passesRating(r.rating, filters.minRating))
      // Foursquare's search fields don't carry a rating count, so a minReviews filter drops
      // everything here. Foursquare is only an alternate; Google is the primary source.
      .filter((r) => passesReviews(r.reviewCount, filters.minReviews));
  }
}

// ---- Google Places (New) ----

/** Subset of a Google Places (New) place we read from a searchNearby response. */
export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  /** Enum string: PRICE_LEVEL_FREE | _INEXPENSIVE | _MODERATE | _EXPENSIVE | _VERY_EXPENSIVE. */
  priceLevel?: string;
  formattedAddress?: string;
  photos?: { name: string }[];
  currentOpeningHours?: { openNow?: boolean };
}

const GOOGLE_PRICE_TIER: Record<string, PriceTier> = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/**
 * Map our cuisine values to Google primary types via the shared cuisine list (single source of
 * truth). Empty or unmapped -> a generic restaurant search.
 */
export function googleTypesFor(categories: string[]): string[] {
  const types = categories
    .map((c) => googleTypeFor(c))
    .filter((t): t is string => Boolean(t));
  return types.length > 0 ? [...new Set(types)] : ["restaurant"];
}

/**
 * A Google photo resource name looks like `places/<id>/photos/<ref>`. We only ever splice this
 * into `https://places.googleapis.com/v1/<name>/media`, so validate it tightly to keep the photo
 * route from being turned into an open proxy.
 */
export function isValidPhotoRef(ref: string): boolean {
  return /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
}

/**
 * Build the URL the client's <img> loads. It points at our own /api/photo route (never Google
 * directly) so the API key stays server-side. `base` is the Worker's public origin in prod and
 * empty in dev, where a relative URL is proxied by Vite.
 */
export function photoProxyUrl(name: string, base = ""): string {
  return `${base}/api/photo?ref=${encodeURIComponent(name)}`;
}

/** Great-circle distance in meters between two lat/lng points. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * Pure mapping from a Google place to our domain shape. Google's Nearby Search (New) doesn't
 * return distance, so we compute it from the search center. `photoBase` is the Worker's public
 * origin used to build the photo-proxy URL (empty in dev). Unit-tested.
 */
export function mapGooglePlace(
  p: GooglePlace,
  center: { lat: number; lng: number },
  photoBase = "",
): Restaurant {
  const photoName = p.photos?.[0]?.name;
  return {
    id: p.id,
    name: p.displayName?.text ?? "Unknown spot",
    category: p.primaryTypeDisplayName?.text ?? "Food",
    priceTier: (p.priceLevel ? GOOGLE_PRICE_TIER[p.priceLevel] : undefined) ?? 2,
    // Google already rates 0-5, matching our scale.
    rating: p.rating != null ? Math.round(p.rating * 10) / 10 : null,
    reviewCount: p.userRatingCount ?? null,
    distanceMeters: p.location
      ? haversineMeters(center, { lat: p.location.latitude, lng: p.location.longitude })
      : 0,
    // Route through our own /api/photo proxy so the API key never reaches the client and the
    // paid Place Photo SKU is fetched (and edge-cached) on demand.
    imageUrl: photoName ? photoProxyUrl(photoName, photoBase) : null,
    address: p.formattedAddress ?? null,
  };
}

export class GooglePlacesRestaurantSource implements RestaurantSource {
  constructor(
    private readonly apiKey: string,
    private readonly publicApiBase = "",
  ) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const center = resolveSearchCenter(filters);

    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        // Field mask drives the billing tier: request only what the deck shows. rating,
        // userRatingCount, priceLevel and currentOpeningHours are all the same (top) tier, and
        // photos is a lower tier, so none of these add cost. Fetching the photo bytes is a
        // separate SKU, billed by /api/photo.
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.primaryTypeDisplayName",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
          "places.formattedAddress",
          "places.photos",
          "places.currentOpeningHours",
        ].join(","),
      },
      body: JSON.stringify({
        includedPrimaryTypes: googleTypesFor(filters.categories),
        maxResultCount: 20,
        rankPreference: filters.sort === "distance" ? "DISTANCE" : "POPULARITY",
        locationRestriction: {
          circle: {
            center: { latitude: center.lat, longitude: center.lng },
            radius: filters.radiusMeters,
          },
        },
      }),
    });
    // Fail soft: an API hiccup shows "nothing nearby" rather than crashing the round.
    if (!res.ok) return [];

    const data = (await res.json()) as { places?: GooglePlace[] };
    const places = (data.places ?? []).filter((p) => p.id && p.displayName?.text);
    // Open-now reads the raw place, so filter before mapping (Restaurant carries no hours).
    const visible = filters.openNow
      ? places.filter((p) => p.currentOpeningHours?.openNow === true)
      : places;
    return visible
      .map((p) => mapGooglePlace(p, center, this.publicApiBase))
      // Google filters by cuisine + radius server-side; the rest is filtered here.
      .filter((r) => r.priceTier <= filters.maxPriceTier)
      .filter((r) => passesRating(r.rating, filters.minRating))
      .filter((r) => passesReviews(r.reviewCount, filters.minReviews));
  }
}

export function createRestaurantSource(
  kind: string,
  apiKey?: string,
  publicApiBase?: string,
): RestaurantSource {
  switch (kind) {
    case "google":
      if (apiKey) return new GooglePlacesRestaurantSource(apiKey, publicApiBase);
      // No key configured: degrade to mock instead of failing.
      return new MockRestaurantSource();
    case "foursquare":
      if (apiKey) return new FoursquareRestaurantSource(apiKey);
      return new MockRestaurantSource();
    case "mock":
    default:
      return new MockRestaurantSource();
  }
}
