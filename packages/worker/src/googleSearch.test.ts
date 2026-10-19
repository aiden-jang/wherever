import { afterEach, describe, expect, it, vi } from "vitest";
import { GooglePlacesRestaurantSource } from "./restaurantSource.js";

const filters = { radiusMeters: 8000, maxPriceTier: 4 as const, categories: [] };
const key = "private-test-key";

afterEach(() => vi.restoreAllMocks());

describe("Google restaurant searches", () => {
  it("records provider rejection codes without logging credentials or the provider message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: `Billing is disabled for ${key}`,
            details: [{ reason: "BILLING_DISABLED", metadata: { consumer: "private-project" } }],
          },
        },
        { status: 403 },
      ),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new GooglePlacesRestaurantSource(key).fetchDeck(filters)).rejects.toThrow(
      "places_fetch_failed",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith("places_search_failed", {
      httpStatus: 403,
      status: "PERMISSION_DENIED",
      reasons: ["BILLING_DISABLED"],
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private-test-key|private-project|Billing is disabled/,
    );
  });

  it("still reports non-JSON provider failures as failures, rather than an empty deck", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream unavailable", { status: 503 }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new GooglePlacesRestaurantSource(key).fetchDeck(filters)).rejects.toThrow(
      "places_fetch_failed",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith("places_search_failed", {
      httpStatus: 503,
      status: undefined,
      reasons: [],
    });
  });

  it("ignores malformed diagnostic fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { error: { status: { private: key }, details: [{ reason: key }, null] } },
        { status: 400 },
      ),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new GooglePlacesRestaurantSource(key).fetchDeck(filters)).rejects.toThrow(
      "places_fetch_failed",
    );
    expect(log).toHaveBeenCalledExactlyOnceWith("places_search_failed", {
      httpStatus: 400,
      status: undefined,
      reasons: [],
    });
  });

  it("keeps a successful empty search distinct from a provider error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(new GooglePlacesRestaurantSource(key).fetchDeck(filters)).resolves.toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
});
