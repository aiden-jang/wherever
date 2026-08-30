import { describe, expect, it } from "vitest";
import { wrapToWidth } from "./wrapText.js";

// Stands in for a canvas: every character is 10 wide, so widths are countable by hand.
const measure = (s: string) => s.length * 10;
const wrap = (text: string, width: number, maxLines?: number) =>
  wrapToWidth(text, width, measure, maxLines === undefined ? {} : { maxLines });

describe("breaking a line to fit the card", () => {
  it("breaks on spaces and keeps every line inside the width", () => {
    for (const line of wrap("Joe's Pizza Broadway and Grill", 100)) {
      expect(measure(line), line).toBeLessThanOrEqual(100);
    }
  });

  it("breaks a word that is wider than the whole line", () => {
    // The old wrapper only broke *between* words, so one long word was drawn off both edges.
    for (const line of wrap("Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch", 100)) {
      expect(measure(line), line).toBeLessThanOrEqual(100);
    }
  });

  it("says it truncated rather than stopping mid-name", () => {
    // A shared image that stops mid-word reads as the whole name of a different restaurant.
    const lines = wrap("One Two Three Four Five Six Seven Eight Nine Ten", 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
  });

  it("keeps the ellipsis inside the width too", () => {
    const lines = wrap("Antico Forno Ristorante Napoletana Brooklyn Heights", 100, 2);
    for (const line of lines) expect(measure(line), line).toBeLessThanOrEqual(100);
  });

  it("does not add an ellipsis when everything fits", () => {
    expect(wrap("Joe's Pizza", 200, 2).join(" ")).not.toContain("…");
  });

  it("collapses the whitespace a name arrives with", () => {
    expect(wrap("  Joe's   Pizza  ", 200)).toEqual(["Joe's Pizza"]);
  });

  it("returns nothing rather than something broken for a nonsense width", () => {
    expect(wrap("Joe's Pizza", 0)).toEqual([]);
    expect(wrap("Joe's Pizza", -10)).toEqual([]);
  });

  it("handles an empty name", () => {
    expect(wrap("", 100)).toEqual([]);
  });
});
