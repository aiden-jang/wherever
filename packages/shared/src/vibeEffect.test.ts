import { describe, expect, it } from "vitest";
import { VIBE_IDS, vibeEffect, vibeEffectLine, vibeOption } from "./vibes.js";
import type { SessionFilters } from "./types.js";

// The host's defaults, which is what a vibe is measured against.
const base: SessionFilters = {
  radiusMeters: 8000,
  maxPriceTier: 4,
  categories: [],
  minRating: 0,
  minReviews: 0,
  openNow: true,
  sort: "popularity",
  revealVoters: true,
};

describe("what a vibe did to the deck", () => {
  it("answers for every vibe the app offers", () => {
    // A vibe that explains nothing is a choice that looks like decoration.
    for (const vibe of VIBE_IDS) {
      expect(vibeEffectLine(vibe, base), vibe).toBeTruthy();
    }
  });

  it("gives chaotic something to actually do", () => {
    // Its filters ask for every price, the widest radius and no floors, which is the default
    // already, so for a long time picking it changed nothing at all and the deck came back in the
    // same best-first order. The shuffle is the part that keeps the promise.
    expect(vibeEffect("chaotic", base).join(" ")).toContain("no particular order");
  });

  it("admits when a vibe changed nothing", () => {
    // The honest answer when a group picks a vibe they were effectively already on.
    const already = { ...base, ...vibeOption("chaotic").filters };
    expect(vibeEffect("chaotic", already)).toEqual([]);
    expect(vibeEffectLine("chaotic", already)).toContain("nothing to change");
  });

  it("reports a narrowing of price, never a full house", () => {
    expect(vibeEffect("chaotic", { ...base, maxPriceTier: 2 }).join(" ")).not.toContain("kept");
    expect(vibeEffect("fancy", base).join(" ")).toContain("kept $$$, $$$$");
  });

  it("names the vibe it is describing", () => {
    for (const vibe of VIBE_IDS) {
      expect(vibeEffectLine(vibe, base), vibe).toContain(vibe);
    }
  });

  it("says a tighter radius is tighter and a wider one is wider", () => {
    expect(vibeEffect("cozy", base).join(" ")).toContain("tightened the search to 1.6 km");
    expect(vibeEffect("quick", base).join(" ")).toContain("tightened the search to 800 m");
    // chaotic and adventurous both sit at the default 8 km, so there is nothing to report.
    expect(vibeEffect("chaotic", base).join(" ")).not.toContain("the search");
  });

  it("calls dropping the floor dropping it, not raising it to zero", () => {
    expect(vibeEffect("chaotic", { ...base, minRating: 4 }).join(" ")).toContain("dropped the rating floor");
    expect(vibeEffect("fancy", base).join(" ")).toContain("raised the rating floor to 4.4");
  });

  it("writes price tiers the way the app writes them everywhere else", () => {
    expect(vibeEffect("fancy", base).join(" ")).toContain("$$$, $$$$");
    expect(vibeEffect("quick", base).join(" ")).toContain("$, $$");
  });

  it("stays short enough for a toast", () => {
    for (const vibe of VIBE_IDS) {
      expect(vibeEffectLine(vibe, base).length, vibe).toBeLessThanOrEqual(80);
    }
  });

  it("does not claim to have changed something that was already set", () => {
    // "only somewhere open now" is not news when the host already required it.
    expect(vibeEffect("quick", base).join(" ")).not.toContain("open now");
    expect(vibeEffect("quick", { ...base, openNow: false }).join(" ")).toContain("open now");
  });
});
