import { describe, expect, it } from "vitest";
import { isInNYC } from "./constants.js";

/*
 * The neighborhood shortcuts are Manhattan and Brooklyn, so this decides whether a group is offered
 * them. It had no tests and no callers at all, which is how the create form ended up showing
 * Williamsburg to somebody who had searched for Denver.
 */
describe("whether a location is NYC enough for the shortcuts", () => {
  it("says yes to the places the shortcuts name", () => {
    expect(isInNYC(40.7306, -73.9866), "Manhattan").toBe(true);
    expect(isInNYC(40.7081, -73.9571), "Williamsburg").toBe(true);
    expect(isInNYC(40.6782, -73.9442), "Brooklyn").toBe(true);
    expect(isInNYC(40.7282, -73.7949), "Queens").toBe(true);
  });

  it("says no to everywhere else somebody might search", () => {
    expect(isInNYC(39.7392, -104.9903), "Denver").toBe(false);
    expect(isInNYC(41.8781, -87.6298), "Chicago").toBe(false);
    expect(isInNYC(51.5072, -0.1276), "London").toBe(false);
    expect(isInNYC(42.3601, -71.0589), "Boston").toBe(false);
  });

  it("says no to the near misses, which are the ones that matter", () => {
    // Close enough to feel like the same trip, far enough that the shortcuts are useless there.
    expect(isInNYC(41.0534, -73.5387), "Stamford CT").toBe(false);
    expect(isInNYC(40.2206, -74.7597), "Trenton NJ").toBe(false);
  });

  it("is not fooled by a swapped latitude and longitude", () => {
    // -73.98 as a latitude is in the Southern Ocean; a box that accepts it accepts anything.
    expect(isInNYC(-73.9866, 40.7306)).toBe(false);
  });
});
