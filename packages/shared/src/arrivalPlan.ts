import type { ArrivalStatus, ArrivalUpdate, PlannedMeetup } from "./protocol.js";
import type { Participant } from "./types.js";

export interface JourneyTiming {
  label: string;
  leaveAt: Date | null;
  eta: Date | null;
  overdueMinutes: number;
}

export interface GroupJourneyPulse {
  total: number;
  checkedIn: number;
  here: number;
  headingOut: number;
  planning: number;
  missing: Participant[];
  overdue: ArrivalUpdate[];
  latestEta: Date | null;
  headline: string;
  detail: string;
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Human timing for a self-reported commute. No location or route data is collected. */
export function journeyTiming(
  planned: PlannedMeetup | null,
  status: ArrivalStatus,
  travelMinutes?: number,
  updatedAt?: string,
  now = new Date(),
): JourneyTiming {
  const minutes = travelMinutes && travelMinutes > 0 ? travelMinutes : null;
  const start = planned ? new Date(planned.start) : null;
  const leaveAt = start && minutes ? new Date(start.getTime() - minutes * 60_000) : null;
  const update = updatedAt ? new Date(updatedAt) : null;
  const eta =
    status === "heading_out" && minutes && update && !Number.isNaN(update.getTime())
      ? new Date(update.getTime() + minutes * 60_000)
      : null;
  const overdueMinutes =
    status === "planning" && leaveAt
      ? Math.max(0, Math.floor((now.getTime() - leaveAt.getTime()) / 60_000))
      : 0;

  if (status === "here") return { label: "here", leaveAt, eta: null, overdueMinutes: 0 };
  if (status === "heading_out") {
    return { label: eta ? `ETA ${clock(eta)}` : "on the way", leaveAt, eta, overdueMinutes: 0 };
  }
  return {
    label: leaveAt ? `leaves by ${clock(leaveAt)}` : "getting ready",
    leaveAt,
    eta: null,
    overdueMinutes,
  };
}

/** A privacy-safe group readout built only from self-reported check-ins. */
export function groupJourneyPulse(
  participants: Participant[],
  arrivals: ArrivalUpdate[],
  planned: PlannedMeetup | null,
  now = new Date(),
): GroupJourneyPulse {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const activeArrivals = arrivals.filter((arrival) => participantIds.has(arrival.participantId));
  const arrivalById = new Map(activeArrivals.map((arrival) => [arrival.participantId, arrival]));
  const missing = participants.filter((participant) => !arrivalById.has(participant.id));
  const here = activeArrivals.filter((arrival) => arrival.status === "here").length;
  const headingOut = activeArrivals.filter((arrival) => arrival.status === "heading_out").length;
  const planning = activeArrivals.filter((arrival) => arrival.status === "planning").length;
  const overdue = activeArrivals.filter(
    (arrival) =>
      journeyTiming(planned, arrival.status, arrival.travelMinutes, arrival.updatedAt, now).overdueMinutes >
      0,
  );
  const etas = activeArrivals
    .map(
      (arrival) => journeyTiming(planned, arrival.status, arrival.travelMinutes, arrival.updatedAt, now).eta,
    )
    .filter((eta): eta is Date => eta !== null);
  const latestEta = etas.length > 0 ? new Date(Math.max(...etas.map((eta) => eta.getTime()))) : null;
  const total = participants.length;
  const checkedIn = activeArrivals.length;

  if (total > 0 && here >= total) {
    return {
      total,
      checkedIn,
      here,
      headingOut,
      planning,
      missing,
      overdue,
      latestEta,
      headline: "Everyone made it",
      detail: "The group is all here.",
    };
  }
  if (overdue.length > 0) {
    const count = overdue.length;
    return {
      total,
      checkedIn,
      here,
      headingOut,
      planning,
      missing,
      overdue,
      latestEta,
      headline: `${count} ${count === 1 ? "person is" : "people are"} past leave-by`,
      detail: "A gentle nudge might save the reservation.",
    };
  }
  if (missing.length > 0) {
    const count = missing.length;
    return {
      total,
      checkedIn,
      here,
      headingOut,
      planning,
      missing,
      overdue,
      latestEta,
      headline: `${count} still off the radar`,
      detail:
        checkedIn === 0
          ? "Not one check-in. The table is being optimistic."
          : `${checkedIn} of ${total} have checked in.`,
    };
  }
  if (headingOut > 0) {
    return {
      total,
      checkedIn,
      here,
      headingOut,
      planning,
      missing,
      overdue,
      latestEta,
      headline: planning > 0 ? "The group is getting moving" : "Everyone is on the move",
      detail: latestEta ? `Latest ETA ${clock(latestEta)}.` : `${headingOut} on the way.`,
    };
  }
  return {
    total,
    checkedIn,
    here,
    headingOut,
    planning,
    missing,
    overdue,
    latestEta,
    headline: "Everyone is accounted for",
    detail: planned ? "Leave-by times are lined up." : "The group has checked in.",
  };
}

export function arrivalPulseText(
  destination: string,
  participants: Participant[],
  arrivals: ArrivalUpdate[],
  planned: PlannedMeetup | null,
  now = new Date(),
): string {
  const pulse = groupJourneyPulse(participants, arrivals, planned, now);
  const arrivalById = new Map(arrivals.map((arrival) => [arrival.participantId, arrival]));
  const when = planned ? `Meet at ${clock(new Date(planned.start))}` : "Meetup time not set";
  const lines = participants.map((participant) => {
    const arrival = arrivalById.get(participant.id);
    if (!arrival) return `• ${participant.displayName}: hasn’t checked in`;
    return `• ${participant.displayName}: ${journeyTiming(planned, arrival.status, arrival.travelMinutes, arrival.updatedAt, now).label}`;
  });
  return [`${destination} arrival pulse`, when, pulse.headline, "", ...lines].join("\n");
}
