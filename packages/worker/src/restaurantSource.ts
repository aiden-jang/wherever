import type { AmenityKey, PriceTier, Restaurant, SessionFilters } from "@wherever/shared";
import { googleTypeFor, NEIGHBORHOODS } from "@wherever/shared";
import { googleTypesFor, mapGooglePlace, type GooglePlace } from "./googlePlace.js";
import { MOCK_DECK } from "./mockDeck.js";

// Fallback center when the host neither picked an area nor shared a location; keeps the app
// functional. NYC, matching the neighborhood set.
const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };

function diagnosticCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Z][A-Z_0-9]{0,99}$/.test(value) ? value : undefined;
}

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

/**
 * Exact price tiers win when set (e.g. only $$ and $$$); otherwise fall back to the legacy "up to
 * maxPriceTier" cap. Lets a group say "mid-range only" instead of just "nothing above $$$".
 */
export function passesPrice(tier: PriceTier, priceTiers?: PriceTier[], maxPriceTier?: PriceTier): boolean {
  if (priceTiers && priceTiers.length > 0) return priceTiers.includes(tier);
  return tier <= (maxPriceTier ?? 4);
}

/**
 * A place passes only if it reports every required amenity as true. An unknown amenity (field
 * absent) does NOT pass — a "dog-friendly" filter shows only confirmed dog-friendly spots.
 */
export function passesAmenities(
  amenities: Partial<Record<AmenityKey, boolean>> | undefined,
  required?: AmenityKey[],
): boolean {
  if (!required || required.length === 0) return true;
  return required.every((key) => amenities?.[key] === true);
}

/* Apply the same cuisine, price, rating, review, and amenity filters to sample data. Sample opening status is a stand-in rather than live hours. */
export class MockRestaurantSource implements RestaurantSource {
  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const excluded = new Set((filters.excludedCategories ?? []).map((c) => c.toLowerCase()));
    return MOCK_DECK.filter((r) => {
      const category = r.category.toLowerCase();
      if (excluded.has(category)) return false;
      if (!passesPrice(r.priceTier, filters.priceTiers, filters.maxPriceTier)) return false;
      if (r.distanceMeters > filters.radiusMeters) return false;
      if (!passesRating(r.rating, filters.minRating)) return false;
      if (!passesReviews(r.reviewCount, filters.minReviews)) return false;
      if (!passesAmenities(r.amenities, filters.amenities)) return false;
      if (filters.categories.length > 0 && !filters.categories.some((c) => c.toLowerCase() === category)) {
        return false;
      }
      return true;
    });
  }
}

// ---- Google Places (New) ----

export class GooglePlacesRestaurantSource implements RestaurantSource {
  constructor(
    private readonly apiKey: string,
    private readonly publicApiBase = "",
  ) {}

  async fetchDeck(filters: SessionFilters): Promise<Restaurant[]> {
    const center = resolveSearchCenter(filters);
    // Map excluded cuisines to Google primary types (no "restaurant" fallback — an empty exclude
    // list must not accidentally exclude every restaurant).
    const excludedGoogleTypes = [
      ...new Set(
        (filters.excludedCategories ?? [])
          .map((c) => googleTypeFor(c))
          .filter((t): t is string => Boolean(t)),
      ),
    ];

    const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        // Card and detail fields determine the provider’s billing tier. Photo bytes use /api/photo.
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
          "places.googleMapsUri",
          "places.websiteUri",
          "places.nationalPhoneNumber",
          "places.businessStatus",
          "places.priceRange",
          // Requested fields determine the provider’s billing tier; quotas must match this mask.
          "places.accessibilityOptions",
          "places.editorialSummary",
          "places.goodForGroups",
          "places.servesVegetarianFood",
          "places.outdoorSeating",
          "places.allowsDogs",
          "places.reservable",
          "places.takeout",
          "places.delivery",
          "places.servesCocktails",
          "places.servesBrunch",
          "places.liveMusic",
          "places.goodForChildren",
        ].join(","),
      },
      body: JSON.stringify({
        includedPrimaryTypes: googleTypesFor(filters.categories),
        // "Not that": exclude the cuisines the group vetoed, server-side, so they never appear.
        ...(excludedGoogleTypes.length > 0 ? { excludedPrimaryTypes: excludedGoogleTypes } : {}),
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
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: { status?: unknown; details?: { reason?: unknown }[] };
      } | null;
      // Provider messages can contain credentials or request data; record only diagnostic codes.
      console.error("places_search_failed", {
        httpStatus: res.status,
        status: diagnosticCode(data?.error?.status),
        reasons: Array.isArray(data?.error?.details)
          ? data.error.details.flatMap((detail) => diagnosticCode(detail?.reason) ?? [])
          : [],
      });
      throw new Error("places_fetch_failed");
    }

    const data = (await res.json()) as { places?: GooglePlace[] };
    const places = (data.places ?? []).filter((p) => p.id && p.displayName?.text);
    // Filter by live open-now status before normalization.
    const visible = filters.openNow ? places.filter((p) => p.currentOpeningHours?.openNow === true) : places;
    return (
      visible
        .map((p) => mapGooglePlace(p, center, this.publicApiBase))
        // Google filters by cuisine + radius server-side; the rest is filtered here.
        .filter((r) => passesPrice(r.priceTier, filters.priceTiers, filters.maxPriceTier))
        .filter((r) => passesRating(r.rating, filters.minRating))
        .filter((r) => passesReviews(r.reviewCount, filters.minReviews))
        .filter((r) => passesAmenities(r.amenities, filters.amenities))
    );
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
    case "mock":
      return new MockRestaurantSource();
    default:
      /* Unknown source names serve the sample deck and log the configuration mistake. The client receives a sample-data reason. */
      console.warn(`Unknown RESTAURANT_SOURCE "${kind}". Serving the sample deck.`);
      return new MockRestaurantSource();
  }
}

/**
 * Whether this source name means stand-in restaurants. A misspelt source is the same lie as a spent
 * budget by a different route, so it takes the same flag rather than serving fiction that looks live.
 */
export function isDemoSource(kind: string, apiKey?: string): boolean {
  return kind !== "google" || !apiKey;
}
