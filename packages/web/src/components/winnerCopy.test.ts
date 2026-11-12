import { expect, it } from "vitest";
import type { Restaurant } from "@wherever/shared";
import { consensusLine, planText } from "./winnerCopy.js";

const place: Restaurant = {
  id: "dinner",
  name: "Dinner Spot",
  category: "pizza",
  rating: 4.5,
  priceTier: 2,
  reviewCount: 20,
  distanceMeters: 100,
  imageUrl: null,
  address: "123 Dinner Lane",
};

it("reserves everyone agreeing for a complete group yes vote", () => {
  expect(consensusLine(4, 4, 0)).toContain("Everyone said yes");
  for (const count of [1, 2, 3]) {
    expect(consensusLine(count, 4, 0)).not.toMatch(/everyone|unanimous/i);
  }
  expect(consensusLine(2, 4, 0)).toContain("Highest score");
});

it("keeps solo receipts and shared plans free of group claims", () => {
  for (let seed = 0; seed < 4; seed++) {
    expect(consensusLine(1, 1, seed)).not.toMatch(/everyone|unanimous|majority|committee/i);
  }
  const text = planText(place, 1, 1);
  expect(text).toContain("Your pick.");
  expect(text).toContain(place.address);
  expect(text).not.toContain("1 of 1 voted yes");
});

it("keeps actual vote counts and the host's choice in group shares", () => {
  const text = planText(place, 1, 4, [], undefined, true);
  expect(text).toContain("The host chose this backup.");
  expect(text).toContain("1 of 4 voted yes.");
  expect(text).not.toMatch(/unanimous|everyone said yes/i);
});
