import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS } from "./constants.js";
import { sessionFiltersSchema } from "./schemas.js";

describe("what a session starts as", () => {
  it("keeps votes anonymous until the host says otherwise", () => {
    // The README promises this twice and the toggle's own copy says "Off. Votes stay anonymous".
    // The client shipped true anyway, so every real session revealed who had finished.
    expect(DEFAULT_FILTERS.revealVoters).toBe(false);
  });

  it("is something the server would actually accept", () => {
    // A default that fails its own validator is a create button that never works.
    expect(sessionFiltersSchema.safeParse(DEFAULT_FILTERS).success).toBe(true);
  });

  it("starts wide, so the first deck is not empty", () => {
    expect(DEFAULT_FILTERS.minRating ?? 0).toBe(0);
    expect(DEFAULT_FILTERS.minReviews ?? 0).toBe(0);
    expect(DEFAULT_FILTERS.categories).toEqual([]);
  });

  it("does not deal in no particular order unless a vibe asks", () => {
    // Shuffling is chaotic's job. A host who picked no vibe should get the source's own ranking.
    expect(DEFAULT_FILTERS.shuffle ?? false).toBe(false);
  });
});
