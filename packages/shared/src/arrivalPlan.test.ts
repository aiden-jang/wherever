import { describe, expect, it } from "vitest";
import { arrivalPulseText, groupJourneyPulse, journeyTiming } from "./arrivalPlan.js";
import type { ArrivalUpdate, Participant } from "./index.js";

const planned = { start: "2026-08-11T23:00:00.000Z", duration: 90 as const };
const participants: Participant[] = [
  { id: "a", displayName: "Aiden", isHost: true, connected: true },
  { id: "b", displayName: "Bo", isHost: false, connected: true },
  { id: "c", displayName: "Cat", isHost: false, connected: true },
];

describe("journeyTiming", () => {
  it("turns the meetup and trip estimate into a leave-by time", () => {
    const timing = journeyTiming(planned, "planning", 30, undefined, new Date("2026-08-11T22:00:00.000Z"));
    expect(timing.leaveAt?.toISOString()).toBe("2026-08-11T22:30:00.000Z");
    expect(timing.overdueMinutes).toBe(0);
  });

  it("flags a missed leave-by time without pretending to track location", () => {
    const timing = journeyTiming(planned, "planning", 20, undefined, new Date("2026-08-11T22:51:00.000Z"));
    expect(timing.overdueMinutes).toBe(11);
  });

  it("estimates arrival from the moment someone says they are heading out", () => {
    const timing = journeyTiming(planned, "heading_out", 25, "2026-08-11T22:10:00.000Z");
    expect(timing.eta?.toISOString()).toBe("2026-08-11T22:35:00.000Z");
  });
});

describe("groupJourneyPulse", () => {
  it("surfaces missing check-ins without implying location tracking", () => {
    const arrivals: ArrivalUpdate[] = [{ participantId: "a", displayName: "Aiden", status: "here" }];
    const pulse = groupJourneyPulse(participants, arrivals, planned, new Date("2026-08-11T22:00:00.000Z"));
    expect(pulse.headline).toBe("2 still off the radar");
    expect(pulse.missing.map((person) => person.displayName)).toEqual(["Bo", "Cat"]);
    expect(pulse.checkedIn).toBe(1);
  });

  it("prioritizes missed leave-by times and finds the latest ETA", () => {
    const arrivals: ArrivalUpdate[] = [
      { participantId: "a", displayName: "Aiden", status: "planning", travelMinutes: 30 },
      {
        participantId: "b",
        displayName: "Bo",
        status: "heading_out",
        travelMinutes: 25,
        updatedAt: "2026-08-11T22:40:00.000Z",
      },
      {
        participantId: "c",
        displayName: "Cat",
        status: "heading_out",
        travelMinutes: 10,
        updatedAt: "2026-08-11T22:40:00.000Z",
      },
    ];
    const pulse = groupJourneyPulse(participants, arrivals, planned, new Date("2026-08-11T22:35:00.000Z"));
    expect(pulse.headline).toBe("1 person is past leave-by");
    expect(pulse.latestEta?.toISOString()).toBe("2026-08-11T23:05:00.000Z");
  });

  it("celebrates when the whole group is there", () => {
    const arrivals = participants.map((person) => ({
      participantId: person.id,
      displayName: person.displayName,
      status: "here" as const,
    }));
    expect(groupJourneyPulse(participants, arrivals, planned).headline).toBe("Everyone made it");
  });

  it("builds a shareable status recap in participant order", () => {
    const text = arrivalPulseText(
      "Night Market",
      participants,
      [{ participantId: "b", displayName: "Bo", status: "here" }],
      null,
    );
    expect(text).toContain("Night Market arrival pulse");
    expect(text).toContain("• Aiden: hasn’t checked in");
    expect(text).toContain("• Bo: here");
  });
});
