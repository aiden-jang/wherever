import type { Restaurant, SessionFilters } from "@wherever/shared";

/**
 * The boundary between the app and wherever restaurants come from. Swap the
 * implementation (mock now, Foursquare in Phase 2) without touching the rest
 * of the Worker.
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

export function createRestaurantSource(kind: string): RestaurantSource {
  switch (kind) {
    case "mock":
      return new MockRestaurantSource();
    // case "foursquare": added in Phase 2
    default:
      return new MockRestaurantSource();
  }
}
