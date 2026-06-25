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

export interface Restaurant {
  id: string;
  name: string;
  /** Short category label, e.g. "Tacos", "Ramen". */
  category: string;
  priceTier: PriceTier;
  /** 0-5, may be null when a source has no rating. */
  rating: number | null;
  /** Meters from the search point. */
  distanceMeters: number;
  imageUrl: string | null;
  address: string | null;
}

export interface Participant {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
}

export interface SessionFilters {
  /** Search radius in meters. */
  radiusMeters: number;
  maxPriceTier: PriceTier;
  /** Empty means no cuisine filter. */
  categories: string[];
  /** Search center. Optional: the mock source ignores it; real sources need it. */
  lat?: number;
  lng?: number;
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
}
