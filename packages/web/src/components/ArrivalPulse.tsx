import { useEffect, useMemo, useState } from "react";
import {
  arrivalPulseText,
  groupJourneyPulse,
  journeyTiming,
  type ArrivalStatus,
  type ArrivalUpdate,
  type Participant,
  type PlannedMeetup,
} from "@wherever/shared";
import { buzz } from "./haptics.js";

type ShareStatus = "sharing" | "shared" | "copied" | null;

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function ArrivalPulse({
  destination,
  participants,
  arrivals,
  planned,
  participantId,
  onArrival,
}: {
  destination: string;
  participants: Participant[];
  arrivals: ArrivalUpdate[];
  planned: PlannedMeetup | null;
  participantId: string | null;
  onArrival: (status: ArrivalStatus | null, travelMinutes?: number) => void;
}) {
  const [travelMinutes, setTravelMinutes] = useState(20);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [shareStatus, setShareStatus] = useState<ShareStatus>(null);
  const myArrivalUpdate = arrivals.find((arrival) => arrival.participantId === participantId);
  const myArrival = myArrivalUpdate?.status ?? null;
  const pulse = useMemo(
    () => groupJourneyPulse(participants, arrivals, planned, clockNow),
    [participants, arrivals, planned, clockNow],
  );
  const arrivalById = new Map(arrivals.map((arrival) => [arrival.participantId, arrival]));
  const denominator = Math.max(1, pulse.total);
  const myTiming = myArrivalUpdate
    ? journeyTiming(planned, myArrivalUpdate.status, myArrivalUpdate.travelMinutes, myArrivalUpdate.updatedAt, clockNow)
    : null;

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (myArrivalUpdate?.travelMinutes) setTravelMinutes(myArrivalUpdate.travelMinutes);
  }, [myArrivalUpdate?.travelMinutes]);

  const updateArrival = (status: ArrivalStatus | null) => {
    buzz(12);
    onArrival(status, travelMinutes);
  };

  const sharePulse = async () => {
    if (shareStatus) return;
    const text = arrivalPulseText(destination, participants, arrivals, planned, clockNow);
    const finish = (status: Exclude<ShareStatus, "sharing" | null>) => {
      setShareStatus(status);
      window.setTimeout(() => setShareStatus(null), 1800);
    };
    setShareStatus("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${destination} arrival pulse`, text });
        finish("shared");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setShareStatus(null);
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      finish("copied");
    } catch {
      setShareStatus(null);
    }
  };

  return (
    <section className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] text-left shadow-lg shadow-black/10">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-acid">
              live arrival pulse
            </span>
            <h2 className="mt-1 font-display text-xl font-bold leading-tight text-cream">{pulse.headline}</h2>
            <p className="mt-1 text-xs text-muted">{pulse.detail}</p>
          </div>
          <button
            type="button"
            onClick={() => void sharePulse()}
            disabled={shareStatus !== null}
            className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-bold text-muted transition hover:border-acid/30 hover:text-acid disabled:opacity-70"
          >
            {shareStatus === "sharing" ? "Opening…" : shareStatus === "shared" ? "Shared ✓" : shareStatus === "copied" ? "Copied ✓" : "Share pulse"}
          </button>
        </div>

        <div
          className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-label="Group arrival progress"
          aria-valuemin={0}
          aria-valuemax={pulse.total}
          aria-valuenow={pulse.checkedIn}
          aria-valuetext={`${pulse.checkedIn} of ${pulse.total} people checked in`}
        >
          <span className="h-full bg-acid transition-[width] duration-500" style={{ width: `${pulse.here / denominator * 100}%` }} />
          <span className="h-full bg-ember transition-[width] duration-500" style={{ width: `${pulse.headingOut / denominator * 100}%` }} />
          <span className="h-full bg-grape transition-[width] duration-500" style={{ width: `${pulse.planning / denominator * 100}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <span className="rounded-xl bg-acid/10 px-2 py-2 text-[10px] font-bold text-acid"><strong className="block text-base leading-none">{pulse.here}</strong>here</span>
          <span className="rounded-xl bg-ember/10 px-2 py-2 text-[10px] font-bold text-ember"><strong className="block text-base leading-none">{pulse.headingOut}</strong>moving</span>
          <span className="rounded-xl bg-grape/15 px-2 py-2 text-[10px] font-bold text-purple-300"><strong className="block text-base leading-none">{pulse.planning}</strong>getting ready</span>
        </div>

        {participants.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Everyone's arrival status">
            {participants.map((participant) => {
              const arrival = arrivalById.get(participant.id);
              const timing = arrival
                ? journeyTiming(planned, arrival.status, arrival.travelMinutes, arrival.updatedAt, clockNow)
                : null;
              const late = Boolean(timing?.overdueMinutes);
              return (
                <li
                  key={participant.id}
                  title={arrival ? `${participant.displayName}: ${timing?.label}` : `${participant.displayName}: not checked in`}
                  className={`flex min-w-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-[10px] ${late ? "border-flare/30 bg-flare/10 text-flare" : arrival ? "border-white/10 bg-black/15 text-cream/90" : "border-dashed border-white/15 text-muted/70"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[8px] font-bold ${arrival?.status === "here" ? "bg-acid text-ink" : arrival?.status === "heading_out" ? "bg-ember/20 text-ember" : arrival?.status === "planning" ? "bg-grape/20 text-purple-300" : "bg-white/[0.06] text-muted"}`}>
                    {initials(participant.displayName)}
                  </span>
                  <span className="max-w-20 truncate">{participant.displayName}</span>
                  <span className="font-semibold">{late ? `${timing!.overdueMinutes}m late` : timing?.label ?? "check-in?"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {participantId && (
        <div className="border-t border-white/10 bg-black/10 p-3">
          {planned && (
            <div className="mb-2.5 rounded-2xl border border-white/10 bg-black/15 p-3">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted">My trip</span>
                  <span className="mt-0.5 block text-xs text-cream">
                    {journeyTiming(planned, "planning", travelMinutes, undefined, clockNow).label}
                  </span>
                </span>
                <div className="flex gap-1" role="group" aria-label="Estimated travel time">
                  {[10, 20, 30, 45].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      aria-pressed={travelMinutes === minutes}
                      onClick={() => setTravelMinutes(minutes)}
                      className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${travelMinutes === minutes ? "border-acid bg-acid text-ink" : "border-white/10 text-muted hover:text-cream"}`}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateArrival("planning")}
                className={`mt-2.5 w-full rounded-full border px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${myArrival === "planning" ? "border-acid/40 bg-acid/10 text-acid" : "border-white/15 text-muted hover:border-acid/40 hover:text-cream"}`}
              >
                {myArrival === "planning" ? "Leave-by shared ✓" : "Share my leave-by"}
              </button>
              {myTiming?.overdueMinutes ? (
                <p className="mt-2 text-center text-[11px] font-semibold text-flare" role="status">
                  Leave-by passed {myTiming.overdueMinutes}m ago. Still getting ready?
                </p>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Update my arrival status">
            {([["heading_out", "Heading out"], ["here", "I’m here"]] as const).map(([status, label]) => (
              <button
                key={status}
                type="button"
                aria-pressed={myArrival === status}
                onClick={() => updateArrival(myArrival === status ? null : status)}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition active:scale-[0.98] ${myArrival === status ? "border-acid bg-acid text-ink" : "border-white/15 text-muted hover:border-acid/40 hover:text-cream"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-muted/60">Self-reported only. Wherever never tracks your location.</p>
        </div>
      )}
    </section>
  );
}
