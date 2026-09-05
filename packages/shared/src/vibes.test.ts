import { describe, expect, it } from "vitest";
import type { SessionFilters } from "./types.js";
import { applyVibe, resolveVibe, VIBES, vibeBreadth, vibeOption, vibeReadingLine } from "./vibes.js";

/* The tie-break is the part worth testing hardest; everything else here is tallying. */

const base: SessionFilters = {
  radiusMeters: 3000,
  maxPriceTier: 4,
  categories: [],
};

describe("the vibes themselves", () => {
  it("all resolve, and none is a duplicate", () => {
    const ids = VIBES.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of VIBES) expect(vibeOption(option.id)).toBe(option);
  });

  it("each says something about the night rather than reciting its own filters", () => {
    for (const option of VIBES) {
      expect(option.blurb, option.id).not.toMatch(/radius|filter|price tier|rating|meters/i);
      expect(option.blurb.length, option.id).toBeLessThan(70);
    }
  });

  it("orders from the narrowest night to the widest", () => {
    // The ordering is what breaks ties, so it is asserted rather than left to whatever the numbers do.
    const ranked = VIBES.map((option) => option.id).sort((a, b) => vibeBreadth(a) - vibeBreadth(b));
    expect(ranked).toEqual(["quick", "fancy", "cozy", "adventurous", "chaotic"]);
  });
});

describe("reading the group", () => {
  it("has no vibe before anybody picks", () => {
    const reading = resolveVibe({});
    expect(reading.vibe).toBeNull();
    expect(reading.total).toBe(0);
  });

  it("ignores a vibe nobody picked rather than counting a zero", () => {
    expect(resolveVibe({ cozy: 3, fancy: 0 })).toMatchObject({
      vibe: "cozy",
      votes: 3,
      total: 3,
      divided: false,
    });
  });

  it("takes the clear winner", () => {
    expect(resolveVibe({ cozy: 3, fancy: 1, quick: 1 }).vibe).toBe("cozy");
  });

  // Two-two is not a narrow win for either, and a coin flip should not hide most of the map.
  it("breaks a tie toward the wider night, not the narrower one", () => {
    const reading = resolveVibe({ quick: 2, fancy: 2 });
    expect(reading.vibe).toBe("fancy");
    expect(vibeBreadth("fancy")).toBeGreaterThan(vibeBreadth("quick"));
    expect(reading.divided).toBe(true);
    expect(reading.runnersUp).toEqual(["quick"]);
  });

  it("breaks a three-way tie the same way, and names the ones it passed over", () => {
    const reading = resolveVibe({ quick: 1, cozy: 1, chaotic: 1 });
    expect(reading.vibe).toBe("chaotic");
    expect(reading.runnersUp).toEqual(["cozy", "quick"]);
  });

  it("is not divided when one vibe leads outright", () => {
    expect(resolveVibe({ quick: 2, fancy: 1 })).toMatchObject({
      vibe: "quick",
      divided: false,
      runnersUp: [],
    });
  });

  it("counts only the people who picked, not the group", () => {
    // Two of five have voted. `total` is about the vote, and the copy needs the group size separately.
    expect(resolveVibe({ cozy: 2 }).total).toBe(2);
  });
});

describe("what the lobby says", () => {
  it("asks for a first pick when there is nothing to report", () => {
    expect(vibeReadingLine(resolveVibe({}), 4)).toBe("No vibe yet. Somebody has to go first.");
  });

  // `votes === total` is true the instant the first person picks, and reads as five people agreeing.
  it("only calls it unanimous when the whole group actually said so", () => {
    expect(vibeReadingLine(resolveVibe({ cozy: 1 }), 5)).not.toMatch(/unanimous/i);
    expect(vibeReadingLine(resolveVibe({ cozy: 5 }), 5)).toMatch(/^Unanimously cozy/);
  });

  it("does not congratulate one person for agreeing with themselves", () => {
    expect(vibeReadingLine(resolveVibe({ cozy: 1 }), 1)).not.toMatch(/unanimous/i);
  });

  it("admits it when the group is split, and says what it did about it", () => {
    const line = vibeReadingLine(resolveVibe({ quick: 2, fancy: 2 }), 4);
    expect(line).toContain("quick");
    expect(line).toContain("fancy");
    expect(line).toMatch(/going wide/);
  });

  it("reports a lead honestly while people are still voting", () => {
    expect(vibeReadingLine(resolveVibe({ cozy: 2, quick: 1 }), 5)).toBe("cozy is ahead, 2 of 3.");
  });

  it("never names anybody, in any state", () => {
    // The wire carries counts only; this is the second half of that promise.
    const readings = [
      resolveVibe({}),
      resolveVibe({ cozy: 1 }),
      resolveVibe({ cozy: 3 }),
      resolveVibe({ quick: 2, fancy: 2 }),
    ];
    for (const reading of readings) {
      const line = vibeReadingLine(reading, 4);
      expect(line, line).not.toMatch(/\bvoted\b|\bpicked by\b|\bthey\b|\bwho\b/i);
    }
  });
});

describe("applying one", () => {
  it("keeps the things a vibe has no opinion about", () => {
    // A neighbourhood, a cuisine and a round timer are not moods, and losing them would be a surprise.
    const host: SessionFilters = { ...base, area: "Williamsburg", categories: ["Ramen"], roundSeconds: 120 };
    const applied = applyVibe(host, "fancy");
    expect(applied.area).toBe("Williamsburg");
    expect(applied.categories).toEqual(["Ramen"]);
    expect(applied.roundSeconds).toBe(120);
    expect(applied.priceTiers).toEqual([3, 4]);
  });

  it("replaces amenities rather than accumulating them", () => {
    // Quick then fancy would demand takeout AND reservable: an empty round with nothing explaining it.
    const applied = applyVibe(applyVibe(base, "quick"), "fancy");
    expect(applied.amenities).toEqual(["reservable"]);
  });

  it("does not hand out the shared filter arrays", () => {
    // Two sessions applying the same vibe must not end up mutating each other's filters.
    const applied = applyVibe(base, "quick");
    applied.amenities!.push("allowsDogs");
    applied.priceTiers!.push(4);
    expect(vibeOption("quick").filters.amenities).toEqual(["takeout"]);
    expect(vibeOption("quick").filters.priceTiers).toEqual([1, 2]);
  });

  it("clears a rating floor when the group goes chaotic", () => {
    // Explicitly set to 0 rather than omitted, or a previous fancy round's 4.4 would silently survive.
    const applied = applyVibe(applyVibe(base, "fancy"), "chaotic");
    expect(applied.minRating).toBe(0);
    expect(applied.priceTiers).toEqual([1, 2, 3, 4]);
  });

  it("leaves the original alone", () => {
    const host: SessionFilters = { ...base, priceTiers: [1] };
    applyVibe(host, "fancy");
    expect(host.priceTiers).toEqual([1]);
  });
});
