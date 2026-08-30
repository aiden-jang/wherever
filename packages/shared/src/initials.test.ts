import { describe, expect, it } from "vitest";
import { initialsFor } from "./initials.js";

describe("the letters in an avatar circle", () => {
  it("takes the first letter of each of the first two names", () => {
    // The bug this replaces: both old copies sliced the first two characters of the whole string,
    // so this person's circle read "AI".
    expect(initialsFor("Aiden Jang")).toBe("AJ");
    expect(initialsFor("Maximilian Bartholomew")).toBe("MB");
  });

  it("ignores anything past the second name", () => {
    expect(initialsFor("Jean Luc Picard")).toBe("JL");
  });

  it("gives a single name two letters, so the circle is not half empty", () => {
    expect(initialsFor("Sam")).toBe("SA");
  });

  it("copes with a one-letter name", () => {
    expect(initialsFor("X")).toBe("X");
  });

  it("says something rather than nothing for an empty name", () => {
    // One old copy returned "?" here and the other returned "", so the circle was blank.
    for (const empty of ["", "   ", "\t"]) expect(initialsFor(empty), JSON.stringify(empty)).toBe("?");
  });

  it("does not cut an emoji in half", () => {
    // slice(0, 2) on an emoji name took both halves of a surrogate pair and rendered tofu.
    expect(initialsFor("😀 Sam")).toBe("😀S");
    expect(initialsFor("🙂")).toBe("🙂");
  });

  it("ignores the extra whitespace a pasted name arrives with", () => {
    expect(initialsFor("  Aiden   Jang  ")).toBe("AJ");
  });

  it("uppercases whatever it finds", () => {
    expect(initialsFor("aiden jang")).toBe("AJ");
  });
});
