// Core domain types shared between the web client and the Worker / Durable Object.

export type SessionStatus = "lobby" | "swiping" | "decided";

/**
 * Majority wins: a left swipe is a downvote, not a hard veto. The restaurant
 * with the most right-swipes wins. Kept as a union so we can add modes later
 * without churning the wire format.
 */
export type VoteMode = "majority";

export type SwipeDirection = "left" | "right";

export type PriceTier = 1 | 2 | 3 | 4;

/** Amenity flags we surface (field names match Google's). Used for both display chips and filters. */
export type AmenityKey =
  | "goodForGroups"
  | "servesVegetarianFood"
  | "outdoorSeating"
  | "allowsDogs"
  | "reservable"
  | "takeout"
  | "delivery"
  | "servesCocktails"
  | "servesBrunch"
  | "liveMusic"
  | "goodForChildren";

export interface Restaurant {
  id: string;
  name: string;
  /** Short category label, e.g. "Tacos", "Ramen". */
  category: string;
  priceTier: PriceTier;
  /** 0-5, may be null when a source has no rating. */
  rating: number | null;
  /** Number of ratings behind the score, null when a source has none. */
  reviewCount: number | null;
  /** Meters from the search point. */
  distanceMeters: number;
  /** First photo, used as the card thumbnail; null when there is none. */
  imageUrl: string | null;
  /** Up to a handful of photo URLs (proxied) for the detail gallery; imageUrl is photos[0]. */
  photos?: string[];
  address: string | null;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" — from Google; null when unknown. */
  businessStatus?: string | null;
  /** Formatted typical spend, e.g. "$10–30"; null when the source has no range. */
  priceRange?: string | null;
  /** A short human blurb about the place (Google's editorial summary); null when none. */
  editorialSummary?: string | null;
  /** Whether the place has a wheelchair-accessible entrance; null when unknown. */
  wheelchairAccessible?: boolean | null;
  /** Known amenity flags, present only for amenities the source actually reports. */
  amenities?: Partial<Record<AmenityKey, boolean>>;
  /** Deep link to the place on Google Maps; null when the source doesn't provide one. */
  googleMapsUri?: string | null;
  /** The place's own website, when known. */
  website?: string | null;
  /** Local phone number, when known. */
  phone?: string | null;
  /** Whether the place is open at search time; null when hours are unknown. */
  openNow?: boolean | null;
  /** Human-readable weekly hours, one line per day (Google's weekdayDescriptions). */
  hours?: string[] | null;
}

/** How the deck is ordered before it's dealt. */
export type RestaurantSort = "popularity" | "distance";

export interface Participant {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
}

export interface SessionFilters {
  /** Search radius in meters. */
  radiusMeters: number;
  /** Legacy "up to this tier" cap. Used only when `priceTiers` is unset/empty. */
  maxPriceTier: PriceTier;
  /** Exact price tiers to allow (e.g. [2,3]). Empty/unset falls back to maxPriceTier. */
  priceTiers?: PriceTier[];
  /** Empty means no cuisine filter. */
  categories: string[];
  /** Cuisines to exclude from results ("not that"); empty means no exclusions. */
  excludedCategories?: string[];
  /** Minimum star rating (0-5). 0 or unset means no rating filter. */
  minRating?: number;
  /** Minimum number of ratings. 0 or unset means no threshold. */
  minReviews?: number;
  /** Only show places open at search time. Unset/false means no open-now filter. */
  openNow?: boolean;
  /** Deck ordering. Defaults to "popularity". */
  sort?: RestaurantSort;
  /**
   * When true, the round shows who has finished voting (names/avatars fill in). When unset/false the
   * server never sends per-person progress, so votes stay anonymous — enforced server-side, not just
   * hidden in the UI. Rides in filters to avoid a separate D1 column; it's a session preference.
   */
  revealVoters?: boolean;
  /** Required amenities; a place must report all of these to appear. Empty/unset = no filter. */
  amenities?: AmenityKey[];
  /** Round countdown in seconds; when it elapses the tally decides. 0/unset means no timer. */
  roundSeconds?: number;
  /** Named search area (a NEIGHBORHOODS value). Overrides lat/lng when set; unset means "near me". */
  area?: string;
  /** Search center. Optional: the mock source ignores it; real sources need it. */
  lat?: number;
  lng?: number;
  /** Human label for a manually-entered center (a geocoded zip/town), for display only. */
  locationLabel?: string;
}

export interface Session {
  id: string;
  code: string;
  status: SessionStatus;
  voteMode: VoteMode;
  filters: SessionFilters;
  participants: Participant[];
}

/** A restaurant the group has already gone to, hidden from future decks. */
export interface VisitedPlace {
  restaurantId: string;
  name: string;
  visitedAt: string;
  /** Kept out of every future deck, not just the next few months. See revisit.ts. */
  neverAgain?: boolean;
}

/** Anonymous, restaurant-free signals about how the round is feeling so far. */
export interface TastePulse {
  rightRate: number;
  activeVoters: number;
  strongestOverlap: number;
  averagePriceTier: number | null;
}
