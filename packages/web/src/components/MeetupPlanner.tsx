import { useState } from "react";
import type { PlannedMeetup, Restaurant } from "@wherever/shared";
import { Modal } from "./Modal.js";

/*
 * Putting the decided dinner on the calendar, lifted out of the match screen.
 *
 * It owns the four bits of state nobody else on that screen reads — the time, the length, the error
 * and its own seeding — so opening the planner costs the winner screen one boolean instead of four.
 * Mounted only while open, so the initial time comes from whatever the group has already planned
 * rather than needing to be pushed in before the dialog appears.
 */

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultPlanStart(): string {
  const date = new Date();
  date.setHours(19, 0, 0, 0);
  if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
  return localDateTime(date);
}

function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function icsText(value: string): string {
  return value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

const pickedBy = (rightSwipes: number, totalParticipants: number): string =>
  `Picked by ${rightSwipes} of ${totalParticipants} on Wherever, Honestly.`;

/** Hands the browser an .ics for one dinner. Exported: a guest can save the host's time too. */
export function downloadInvite(restaurant: Restaurant, start: Date, duration: number, details: string): void {
  const end = new Date(start.getTime() + duration * 60_000);
  const uid = `${restaurant.id}-${start.getTime()}@wherever`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wherever Honestly//EN",
    "BEGIN:VEVENT",
    `UID:${icsText(uid)}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`Dinner at ${restaurant.name}`)}`,
    `LOCATION:${icsText(restaurant.address ?? restaurant.name)}`,
    `DESCRIPTION:${icsText(details)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = `${
    restaurant.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "dinner"
  }.ics`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function MeetupPlanner({
  restaurant,
  rightSwipes,
  totalParticipants,
  planned,
  onPlan,
  onClose,
}: {
  restaurant: Restaurant;
  rightSwipes: number;
  totalParticipants: number;
  planned?: PlannedMeetup | null;
  onPlan: (plan: PlannedMeetup | null) => void;
  onClose: () => void;
}) {
  const [planStart, setPlanStart] = useState(() =>
    planned ? localDateTime(new Date(planned.start)) : defaultPlanStart(),
  );
  const [planDuration, setPlanDuration] = useState<PlannedMeetup["duration"]>(planned?.duration ?? 90);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const downloadCalendar = (start: Date, duration: number) =>
    downloadInvite(restaurant, start, duration, pickedBy(rightSwipes, totalParticipants));

  const addToCalendar = () => {
    const start = new Date(planStart);
    if (Number.isNaN(start.getTime())) {
      setCalendarError("Pick a time first.");
      return;
    }
    if (start.getTime() < Date.now()) {
      setCalendarError("Pick a time that hasn’t happened yet.");
      return;
    }
    downloadCalendar(start, planDuration);
    onPlan({ start: start.toISOString(), duration: planDuration });
    onClose();
  };

  const openCalendar = (provider: "google" | "outlook") => {
    const start = new Date(planStart);
    if (Number.isNaN(start.getTime())) {
      setCalendarError("Pick a time first.");
      return;
    }
    if (start.getTime() < Date.now()) {
      setCalendarError("Pick a time that hasn’t happened yet.");
      return;
    }
    const end = new Date(start.getTime() + planDuration * 60_000);
    const title = `Dinner at ${restaurant.name}`;
    const location = restaurant.address ?? restaurant.name;
    const details = `Picked by ${rightSwipes} of ${totalParticipants} on Wherever, Honestly.`;
    const url =
      provider === "google"
        ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(start)}/${icsDate(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(details)}`
        : `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}&location=${encodeURIComponent(location)}&body=${encodeURIComponent(details)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onPlan({ start: start.toISOString(), duration: planDuration });
    onClose();
  };

  return (
    <Modal title="Put dinner on the calendar" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        Save {restaurant.name} wherever the group keeps plans.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["Tonight", 0],
            ["Tomorrow", 1],
            ["This weekend", "weekend"],
          ] as const
        ).map(([label, offset]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const date = new Date();
              if (offset === "weekend") {
                const days = (6 - date.getDay() + 7) % 7 || 7;
                date.setDate(date.getDate() + days);
              } else {
                date.setDate(date.getDate() + offset);
              }
              date.setHours(19, 0, 0, 0);
              if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1);
              setPlanStart(localDateTime(date));
              setCalendarError(null);
            }}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-muted hover:border-acid/50 hover:text-acid transition"
          >
            {label}
          </button>
        ))}
      </div>
      <label
        className="mt-5 block text-xs font-semibold uppercase tracking-wider text-muted"
        htmlFor="dinner-time"
      >
        Start time
      </label>
      <input
        id="dinner-time"
        type="datetime-local"
        value={planStart}
        min={localDateTime(new Date())}
        onChange={(event) => setPlanStart(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/15 bg-ink px-3 py-3 text-sm text-cream outline-none focus:border-acid"
      />
      <label
        className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted"
        htmlFor="dinner-duration"
      >
        How long
      </label>
      <select
        id="dinner-duration"
        value={planDuration}
        onChange={(event) => setPlanDuration(Number(event.target.value) as 60 | 90 | 120)}
        className="mt-2 w-full rounded-xl border border-white/15 bg-ink px-3 py-3 text-sm text-cream outline-none focus:border-acid"
      >
        <option value={60}>1 hour</option>
        <option value={90}>1½ hours</option>
        <option value={120}>2 hours</option>
      </select>
      {calendarError && (
        <p role="alert" className="mt-2 text-sm text-flare">
          {calendarError}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => openCalendar("google")}
          className="rounded-full bg-ember px-4 py-3 text-sm font-semibold text-ink hover:brightness-110 active:scale-[0.98] transition"
        >
          Google Calendar ↗
        </button>
        <button
          type="button"
          onClick={() => openCalendar("outlook")}
          className="rounded-full border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/5 active:scale-[0.98] transition"
        >
          Outlook ↗
        </button>
      </div>
      <button
        type="button"
        onClick={addToCalendar}
        className="mt-2 w-full rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-muted hover:border-white/20 hover:text-cream active:scale-[0.98] transition"
      >
        Download .ics for Apple Calendar
      </button>
      <button
        type="button"
        onClick={() => {
          const start = new Date(planStart);
          if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
            setCalendarError(
              Number.isNaN(start.getTime()) ? "Pick a time first." : "Pick a time that hasn’t happened yet.",
            );
            return;
          }
          onPlan({ start: start.toISOString(), duration: planDuration });
          onClose();
        }}
        className="mt-2 w-full rounded-full px-5 py-2 text-xs font-semibold text-muted hover:text-cream transition"
      >
        Save for everyone
      </button>
      {planned && (
        <button
          type="button"
          onClick={() => {
            onPlan(null);
            onClose();
          }}
          className="mt-1 w-full rounded-full px-5 py-2 text-xs font-semibold text-flare/80 transition hover:text-flare"
        >
          Clear meetup time for everyone
        </button>
      )}
    </Modal>
  );
}
