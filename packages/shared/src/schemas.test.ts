import { describe, expect, it } from "vitest";
import { REACTION_EMOJIS } from "./constants.js";
import { clientMessageSchema } from "./schemas.js";

describe("reactions", () => {
  const react = (emoji: string) => clientMessageSchema.safeParse({ type: "react", emoji }).success;

  it("accepts the set the bar renders", () => {
    for (const emoji of REACTION_EMOJIS) expect(react(emoji), emoji).toBe(true);
  });

  it("rejects an emoji the bar does not offer", () => {
    expect(react("🥔")).toBe(false);
  });
});
