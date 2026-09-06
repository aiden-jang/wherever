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

/*
 * When this fails because the schema is gone, that is the cleanup working, not a regression: delete
 * this block with it.
 */
describe("meetup plan messages, accepted and ignored for one release", () => {
  const plan = (planned: unknown) => clientMessageSchema.safeParse({ type: "set_plan", planned }).success;

  it("still parses what the previous bundle sends, so nobody gets an error toast", () => {
    expect(plan({ start: "2026-08-15T23:00:00.000Z", duration: 90 })).toBe(true);
    expect(plan(null)).toBe(true);
  });

  it("does not become a hole: a malformed one is still refused", () => {
    expect(plan({ start: "Saturday night", duration: 90 })).toBe(false);
    expect(plan({ start: "2026-08-15T23:00:00.000Z", duration: 45 })).toBe(false);
  });
});
