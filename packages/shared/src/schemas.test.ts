import { describe, expect, it } from "vitest";
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

describe("arrival status messages", () => {
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
