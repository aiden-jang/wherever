import type { Restaurant } from "@wherever/shared";

/*
 * Amenities are carried here because the vibes ask for them: "quick" requires takeout and "fancy"
 * requires reservable. Without them every amenity filter matches nothing, and a demo deck that goes
 * empty the moment somebody picks a vibe is worse than one that ignores the filter.
 *
 * Phone and website for the same reason: the result screen's two links render only when the winner
 * has them, so a deck without them hides the buttons on every demo and dev run.
 */
export const MOCK_DECK: Restaurant[] = [
  {
    id: "mock-1",
    name: "The Usual",
    category: "Burgers",
    priceTier: 2,
    rating: 4.3,
    reviewCount: 820,
    distanceMeters: 400,
    imageUrl: null,
    address: "12 Main St",
    phone: "(212) 555-0101",
    website: "https://example.com/the-usual",
    amenities: { takeout: true, delivery: true, goodForGroups: true, goodForChildren: true },
  },
  {
    id: "mock-2",
    name: "Probably Fine Tacos",
    category: "Tacos",
    priceTier: 1,
    rating: 4.6,
    reviewCount: 1540,
    distanceMeters: 750,
    imageUrl: null,
    address: "88 2nd Ave",
    phone: "(212) 555-0102",
    website: "https://example.com/probably-fine-tacos",
    amenities: { takeout: true, delivery: true, outdoorSeating: true },
  },
  {
    id: "mock-3",
    name: "Noodle Situation",
    category: "Ramen",
    priceTier: 2,
    rating: 4.1,
    reviewCount: 210,
    distanceMeters: 1100,
    imageUrl: null,
    address: "5 Bowl Ln",
    phone: "(212) 555-0103",
    website: "https://example.com/noodle-situation",
    amenities: { takeout: true, reservable: true, servesVegetarianFood: true },
  },
  {
    id: "mock-4",
    name: "Salad, I Guess",
    category: "Healthy",
    priceTier: 2,
    rating: 3.9,
    reviewCount: 47,
    distanceMeters: 300,
    imageUrl: null,
    address: "200 Green St",
    phone: "(212) 555-0104",
    website: "https://example.com/salad-i-guess",
    amenities: { takeout: true, delivery: true, servesVegetarianFood: true, outdoorSeating: true },
  },
  {
    id: "mock-5",
    name: "Late Night Pizza Decisions",
    category: "Pizza",
    priceTier: 1,
    rating: 4.4,
    reviewCount: 3020,
    distanceMeters: 950,
    imageUrl: null,
    address: "1 Slice Blvd",
    phone: "(212) 555-0105",
    website: "https://example.com/late-night-pizza-decisions",
    amenities: { takeout: true, delivery: true, goodForGroups: true },
  },
  // Every other entry is tier 1 or 2, so "fancy" (tiers 3-4, 4.4 stars, reservable) matched nothing
  // and emptied the demo deck the moment a group picked it. The deck has to be able to answer every
  // vibe the app offers.
  {
    id: "mock-6",
    name: "The Reservation",
    category: "Italian",
    priceTier: 4,
    rating: 4.7,
    reviewCount: 1180,
    distanceMeters: 1900,
    imageUrl: null,
    address: "9 Tablecloth Row",
    phone: "(212) 555-0106",
    website: "https://example.com/the-reservation",
    amenities: { reservable: true, servesCocktails: true, goodForGroups: true },
  },
];
