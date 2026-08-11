import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "./schemas.js";

describe("shared meetup plan messages", () => {
  it("accepts a supported meetup time and clearing the plan", () => {
    expect(clientMessageSchema.safeParse({
      type: "set_plan",
      planned: { start: "2026-08-15T23:00:00.000Z", duration: 90 },
    }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "set_plan", planned: null }).success).toBe(true);
  });

  it("rejects malformed dates and unsupported durations", () => {
    expect(clientMessageSchema.safeParse({
      type: "set_plan",
      planned: { start: "Saturday night", duration: 90 },
    }).success).toBe(false);
    expect(clientMessageSchema.safeParse({
      type: "set_plan",
      planned: { start: "2026-08-15T23:00:00.000Z", duration: 45 },
    }).success).toBe(false);
  });
});
