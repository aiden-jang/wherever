import { describe, expect, it } from "vitest";
import { REACTION_EMOJIS } from "./constants.js";
import { clientMessageSchema } from "./schemas.js";

describe("shared meetup plan messages", () => {
  it("accepts a supported meetup time and clearing the plan", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "set_plan",
        planned: { start: "2026-08-15T23:00:00.000Z", duration: 90 },
      }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "set_plan", planned: null }).success).toBe(true);
  });

  it("rejects malformed dates and unsupported durations", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "set_plan",
        planned: { start: "Saturday night", duration: 90 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "set_plan",
        planned: { start: "2026-08-15T23:00:00.000Z", duration: 45 },
      }).success,
    ).toBe(false);
  });
});

/*
 * The arrival pulse is deleted; the message is still parsed so a client on the previous bundle gets
 * silence rather than an error toast. When this fails because the schema is gone, that is the
 * cleanup working: delete this block with it.
 */
describe("arrival status messages, accepted and ignored for one release", () => {
  it("accepts planning, arrival statuses, trip estimates, and clearing", () => {
    expect(
      clientMessageSchema.safeParse({ type: "set_arrival", status: "planning", travelMinutes: 25 }).success,
    ).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "set_arrival", status: "heading_out" }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "set_arrival", status: "here" }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "set_arrival", status: null }).success).toBe(true);
  });

  it("rejects arbitrary presence labels", () => {
    expect(clientMessageSchema.safeParse({ type: "set_arrival", status: "five_minutes" }).success).toBe(
      false,
    );
    expect(
      clientMessageSchema.safeParse({ type: "set_arrival", status: "planning", travelMinutes: 0 }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "set_arrival", status: "planning", travelMinutes: 181 }).success,
    ).toBe(false);
  });
});

describe("reactions across a deploy", () => {
  const react = (emoji: string) => clientMessageSchema.safeParse({ type: "react", emoji }).success;

  it("accepts the set the bar renders", () => {
    for (const emoji of REACTION_EMOJIS) expect(react(emoji), emoji).toBe(true);
  });

  /*
   * The overlap is deliberate and temporary. When this fails because the retired set is gone, that
   * is the cleanup working: delete this test with it. Deleting it while the widening is still in
   * `constants.ts` is the mistake it exists to catch.
   */
  it("still accepts the retired set, so a deploy does not break anyone mid-round", () => {
    for (const emoji of ["😍", "🤤", "😂", "🙅"]) expect(react(emoji), emoji).toBe(true);
  });

  it("rejects an emoji from neither set", () => {
    expect(react("🥔")).toBe(false);
  });
});
