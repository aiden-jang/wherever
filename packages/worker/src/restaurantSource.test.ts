import { describe, expect, it } from "vitest";
import { mapFoursquarePlace, type FoursquarePlace } from "./restaurantSource.js";

describe("mapFoursquarePlace", () => {
  it("maps a full place to our domain shape", () => {
    const place: FoursquarePlace = {
      fsq_place_id: "abc123",
      name: "Joe's Pizza",
      location: { address: "7 Carmine St" },
      categories: [{ name: "Pizzeria" }, { name: "Italian" }],
      distance: 320,
      price: 1,
      rating: 9.2,
      photos: [{ prefix: "https://fastly.fsq.com/p/", suffix: "/abc.jpg" }],
    };
    const r = mapFoursquarePlace(place);
    expect(r).toEqual({
      id: "abc123",
      name: "Joe's Pizza",
      category: "Pizzeria",
      priceTier: 1,
      rating: 4.6, // 9.2 / 2
      distanceMeters: 320,
      imageUrl: "https://fastly.fsq.com/p/original/abc.jpg",
      address: "7 Carmine St",
    });
  });

  it("supplies safe defaults when optional fields are missing", () => {
    const r = mapFoursquarePlace({ fsq_place_id: "x", name: "Mystery Spot" });
    expect(r.category).toBe("Food");
    expect(r.priceTier).toBe(2);
    expect(r.rating).toBeNull();
    expect(r.distanceMeters).toBe(0);
    expect(r.imageUrl).toBeNull();
    expect(r.address).toBeNull();
  });

  it("clamps an out-of-range price tier", () => {
    expect(mapFoursquarePlace({ fsq_place_id: "x", name: "n", price: 9 }).priceTier).toBe(4);
    expect(mapFoursquarePlace({ fsq_place_id: "x", name: "n", price: 0 }).priceTier).toBe(1);
  });
});
