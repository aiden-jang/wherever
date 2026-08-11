import { describe, expect, it } from "vitest";
import { matchReasons } from "./matchReasons.js";
import type { Restaurant, SessionFilters } from "./types.js";

const restaurant: Restaurant = {
  id: "r1",
  name: "Night Noodles",
  category: "Ramen restaurant",
  priceTier: 2,
  rating: 4.7,
  reviewCount: 900,
  distanceMeters: 720,
  imageUrl: null,
  address: "1 Main St",
  openNow: true,
  amenities: { goodForGroups: true, reservable: false },
};
const filters: SessionFilters = {
  radiusMeters: 1600,
  maxPriceTier: 3,
  priceTiers: [2, 3],
  categories: ["ramen"],
  minRating: 4.5,
  amenities: ["goodForGroups"],
};

describe("matchReasons", () => {
  it("leads with unanimous agreement and practical reasons the place actually satisfies", () => {
    expect(matchReasons(restaurant, filters, 4, 4)).toEqual([
      { icon: "✦", label: "Everyone said yes" },
      { icon: "◷", label: "Open right now" },
      { icon: "⌁", label: "Ramen craving matched" },
      { icon: "✓", label: "Good for groups" },
    ]);
  });

  it("never claims an amenity the provider did not confirm", () => {
    const reasons = matchReasons(restaurant, { ...filters, amenities: ["reservable"] }, 2, 3);
    expect(reasons.map((reason) => reason.label)).not.toContain("Takes reservations");
    expect(reasons[0]?.label).toBe("2 of 3 backed it");
  });

  it("keeps a useful reveal when the host used no filters", () => {
    const reasons = matchReasons(restaurant, undefined, 1, 1);
    expect(reasons.map((reason) => reason.label)).toEqual([
      "Your top pick",
      "Open right now",
      "4.7★ crowd favorite",
      "0.4 mi away",
    ]);
  });

  it("does not call a closed restaurant open", () => {
    const reasons = matchReasons({ ...restaurant, openNow: false }, undefined, 2, 2);
    expect(reasons.map((reason) => reason.label)).not.toContain("Open right now");
  });
});
