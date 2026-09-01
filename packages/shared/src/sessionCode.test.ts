import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, isCompleteCode, sessionCodeFrom, sessionCodeFromShare } from "./sessionCode.js";

describe("reading a pasted session code", () => {
  it("takes a plain code", () => {
    expect(sessionCodeFrom("TM4ERX")).toBe("TM4ERX");
  });

  it("uppercases what was typed in lower case", () => {
    expect(sessionCodeFrom("tm4erx")).toBe("TM4ERX");
  });

  it("survives the whitespace a copy picks up", () => {
    expect(sessionCodeFrom("  TM4ERX \n")).toBe("TM4ERX");
    expect(sessionCodeFrom("TM4 ERX")).toBe("TM4ERX");
  });

  it("pulls the code out of the invite link, which is what people actually paste", () => {
    // A maxLength input truncates this to "HTTPS:" and the join silently fails.
    expect(sessionCodeFrom("https://wherever.aidenjang.com/s/TM4ERX")).toBe("TM4ERX");
    expect(sessionCodeFrom("http://localhost:30003/s/tm4erx")).toBe("TM4ERX");
  });

  it("does not try to mine a code out of prose", () => {
    // "join with" is itself made of alphabet letters, so there is no honest way to find the code in
    // a sentence. Filling the field with "JNWTHT" would be worse than leaving it alone.
    expect(sessionCodeFrom("join with TM4ERX pls")).not.toBe("TM4ERX");
  });

  it("drops characters the alphabet never mints", () => {
    // 0, O, 1, I and L are excluded precisely because they get misread, so they cannot be meant.
    expect(sessionCodeFrom("TM4ERX0OIL")).toBe("TM4ERX");
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it("never returns more than a code's worth", () => {
    expect(sessionCodeFrom("ABCDEFGHJK")).toHaveLength(CODE_LENGTH);
  });

  it("gives back an empty string when there is nothing usable", () => {
    expect(sessionCodeFrom("")).toBe("");
    expect(sessionCodeFrom("0110")).toBe("");
  });

  it("knows when there is enough to try", () => {
    expect(isCompleteCode("TM4ER")).toBe(false);
    expect(isCompleteCode("TM4ERX")).toBe(true);
  });
});

describe("a code out of a share", () => {
  it("takes one from an invite link", () => {
    expect(sessionCodeFromShare("https://wherever.aidenjang.com/s/TM4ERX")).toBe("TM4ERX");
    expect(sessionCodeFromShare("come eat: https://wherever.aidenjang.com/s/AYSJCE now")).toBe("AYSJCE");
  });

  it("refuses prose, however many letters it has", () => {
    // Six alphabet letters are trivially available in any sentence. `sessionCodeFrom` would take them.
    expect(sessionCodeFrom("check out this pizza place")).toHaveLength(6);
    expect(sessionCodeFromShare("check out this pizza place")).toBe("");
    expect(sessionCodeFromShare("")).toBe("");
  });

  it("refuses a link that has no complete code in it", () => {
    expect(sessionCodeFromShare("https://wherever.aidenjang.com/s/AB")).toBe("");
  });

  it("refuses a bare code with no link around it, because that could be anything", () => {
    expect(sessionCodeFromShare("TM4ERX")).toBe("");
  });
});
