import { googleTypeFor, type AmenityKey, type PriceTier, type Restaurant } from "@wherever/shared";
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
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  priceRange?: { startPrice?: GoogleMoney; endPrice?: GoogleMoney };
  editorialSummary?: { text?: string };
  accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean };
  goodForGroups?: boolean;
  servesVegetarianFood?: boolean;
  outdoorSeating?: boolean;
  allowsDogs?: boolean;
  reservable?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  servesCocktails?: boolean;
  servesBrunch?: boolean;
  liveMusic?: boolean;
  goodForChildren?: boolean;
}

/** Google's Money shape: an integer amount as a string plus a currency code. */
interface GoogleMoney {
  currencyCode?: string;
  units?: string;
}

/** At most this many photos are surfaced per place for the detail gallery. */
const MAX_GALLERY_PHOTOS = 5;

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  CAD: "$",
  AUD: "$",
  NZD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
};

function formatMoney(m?: GoogleMoney): string | null {
  if (!m?.units) return null;
  const symbol = m.currencyCode ? (CURRENCY_SYMBOL[m.currencyCode] ?? `${m.currencyCode} `) : "";
  return `${symbol}${m.units}`;
}

/** Turn Google's start/end money range into a compact label like "$10–30", "$10+", or "Up to $30". */
export function formatPriceRange(range?: {
  startPrice?: GoogleMoney;
  endPrice?: GoogleMoney;
}): string | null {
  if (!range) return null;
  const start = formatMoney(range.startPrice);
  const end = formatMoney(range.endPrice);
  // Drop the repeated symbol on the high end when both share a currency: "$10-30", not "$10-$30".
  // Hyphen, not an en-dash: a number range reads the same and the dash characters are the single
  // most reliable giveaway that a string was written by a machine.
  if (start && end) {
    const endBare = range.endPrice?.units ?? end;
    const sameCurrency = range.startPrice?.currencyCode === range.endPrice?.currencyCode;
    return `${start}-${sameCurrency ? endBare : end}`;
  }
  if (start) return `${start}+`;
  if (end) return `Up to ${end}`;
  return null;
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
  const types = categories.map((c) => googleTypeFor(c)).filter((t): t is string => Boolean(t));
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
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
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
  // Proxy the first few photo refs (already in the search response — no extra billing for the refs
  // themselves; a photo is only paid for when its bytes are actually fetched via /api/photo).
  const photoUrls = (p.photos ?? [])
    .map((ph) => ph.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_GALLERY_PHOTOS)
    .map((name) => photoProxyUrl(name, photoBase));
  // Keep only amenities Google actually reported (a missing field means "unknown", not "no").
  const amenities: Partial<Record<AmenityKey, boolean>> = {};
  if (typeof p.goodForGroups === "boolean") amenities.goodForGroups = p.goodForGroups;
  if (typeof p.servesVegetarianFood === "boolean") amenities.servesVegetarianFood = p.servesVegetarianFood;
  if (typeof p.outdoorSeating === "boolean") amenities.outdoorSeating = p.outdoorSeating;
  if (typeof p.allowsDogs === "boolean") amenities.allowsDogs = p.allowsDogs;
  if (typeof p.reservable === "boolean") amenities.reservable = p.reservable;
  if (typeof p.takeout === "boolean") amenities.takeout = p.takeout;
  if (typeof p.delivery === "boolean") amenities.delivery = p.delivery;
  if (typeof p.servesCocktails === "boolean") amenities.servesCocktails = p.servesCocktails;
  if (typeof p.servesBrunch === "boolean") amenities.servesBrunch = p.servesBrunch;
  if (typeof p.liveMusic === "boolean") amenities.liveMusic = p.liveMusic;
  if (typeof p.goodForChildren === "boolean") amenities.goodForChildren = p.goodForChildren;
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
    imageUrl: photoUrls[0] ?? null,
    photos: photoUrls,
    address: p.formattedAddress ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    /*
     * Swap Google's en-dash for our hyphen, and nothing else.
     *
     * `weekdayDescriptions` arrives as "Monday: 8:00 AM - 11:00 PM" and is rendered verbatim, so an
     * upstream en-dash ends up sitting next to our own typography. A time range reads the same either
     * way, and it is the one character that makes a page look machine-set.
     */
    hours:
      p.currentOpeningHours?.weekdayDescriptions?.map((line) => line.replace(/\s[–—]\s/g, " - ")) ?? null,
    businessStatus: p.businessStatus ?? null,
    priceRange: formatPriceRange(p.priceRange),
    editorialSummary: p.editorialSummary?.text ?? null,
    wheelchairAccessible: p.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
    amenities,
  };
}
