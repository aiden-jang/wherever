import { describe, expect, it } from "vitest";
import { shuffleDeck } from "./shuffle.js";
import type { Restaurant } from "./types.js";

const deck = (n: number): Restaurant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Place ${i}` }) as Restaurant);

describe("dealing in no particular order", () => {
  it("keeps every place, and none twice", () => {
    const before = deck(30);
    const after = shuffleDeck(before, "SAR7X7");
    expect(after).toHaveLength(before.length);
    expect(new Set(after.map((r) => r.id))).toEqual(new Set(before.map((r) => r.id)));
  });

  it("leaves the caller's deck alone", () => {
    const before = deck(10);
    const ids = before.map((r) => r.id);
    shuffleDeck(before, "seed");
    expect(before.map((r) => r.id)).toEqual(ids);
  });

  it("gives the same session the same order every time", () => {
    // The deck is cached, but a bad order should be reproducible from the code alone.
    const a = shuffleDeck(deck(20), "ABC123").map((r) => r.id);
    const b = shuffleDeck(deck(20), "ABC123").map((r) => r.id);
    expect(a).toEqual(b);
  });

  it("gives different sessions different orders", () => {
    const a = shuffleDeck(deck(20), "ABC123").map((r) => r.id);
    const b = shuffleDeck(deck(20), "XYZ789").map((r) => r.id);
    expect(a).not.toEqual(b);
  });

  it("actually moves things, rather than returning the source order", () => {
    // The point of the whole module: the source ranks best-first and the top of the deck is always
    // the same safe handful.
    const before = deck(40).map((r) => r.id);
    expect(shuffleDeck(deck(40), "SAR7X7").map((r) => r.id)).not.toEqual(before);
  });

  it("does not choke on a deck of nothing or of one", () => {
    expect(shuffleDeck([], "seed")).toEqual([]);
    expect(shuffleDeck(deck(1), "seed").map((r) => r.id)).toEqual(["r0"]);
  });

  it("reaches every position, rather than nudging the deck", () => {
    // A weak shuffle leaves the first card first most of the time. Over many seeds it should not.
    const firsts = new Set(
      Array.from({ length: 50 }, (_, i) => shuffleDeck(deck(12), `seed-${i}`)[0]!.id),
    );
    expect(firsts.size).toBeGreaterThan(6);
  });
});
