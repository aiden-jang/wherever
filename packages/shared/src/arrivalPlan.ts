import type { ArrivalStatus, PlannedMeetup } from './protocol.js';

export interface JourneyTiming {
  label: string;
  leaveAt: Date | null;
  eta: Date | null;
  overdueMinutes: number;
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
  const eta = status === 'heading_out' && minutes && update && !Number.isNaN(update.getTime())
    ? new Date(update.getTime() + minutes * 60_000)
    : null;
  const overdueMinutes = status === 'planning' && leaveAt
    ? Math.max(0, Math.floor((now.getTime() - leaveAt.getTime()) / 60_000))
    : 0;

  if (status === 'here') return { label: 'here', leaveAt, eta: null, overdueMinutes: 0 };
  if (status === 'heading_out') {
    return { label: eta ? `ETA ${clock(eta)}` : 'on the way', leaveAt, eta, overdueMinutes: 0 };
  }
  return { label: leaveAt ? `leaves by ${clock(leaveAt)}` : 'getting ready', leaveAt, eta: null, overdueMinutes };
}
