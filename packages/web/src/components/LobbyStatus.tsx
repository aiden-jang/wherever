import { useEffect, useState } from "react";
import type { DemoReason } from "@wherever/shared";

/*
 * What the room is doing, said in the small print: the connection, the deck's provenance, the rules,
 * and the clock. None of it is about who is here — that is LobbyPeople.
 */

export function DisconnectBanner({ reconnecting }: { reconnecting: boolean }) {
  if (reconnecting) {
    return (
      <div role="status" className="room-connection bg-white/10 text-sm font-medium text-cream">
        Connection dropped. Voting pauses until you reconnect.
      </div>
    );
  }
  return (
    <div role="status" className="room-connection bg-flare text-sm font-medium text-ink">
      Still can&apos;t reach the session.{" "}
      <button
        type="button"
        onClick={() => location.reload()}
        className="inline-flex min-h-11 items-center font-semibold underline"
      >
        Reload to rejoin
      </button>
    </div>
  );
}

/**
 * Sample restaurants, framed as still playable rather than as an error, because it is.
 *
 * Two reasons, two sentences. Saying "we hit our budget" when the truth is "nothing live is
 * configured" is a small lie about the one thing this app is careful with, and the server knows which.
 */
export function DemoBanner({ reason }: { reason: DemoReason }) {
  return (
    <p className="room-demo rounded-xl border border-white/15 px-3 py-2 text-sm text-muted">
      <strong className="text-cream">Sample restaurants.</strong>{" "}
      {reason === "budget"
        ? "Live places return when the monthly limit resets."
        : "You can still try a round."}
    </p>
  );
}

export function HowItWorks() {
  const steps = [
    { emoji: "👆", label: "Everyone swipes" },
    { emoji: "🗳️", label: "Highest score wins" },
    { emoji: "🍽️", label: "Nobody's fault" },
  ];
  return (
    <div className="w-full mt-10 grid grid-cols-3 gap-2">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 border border-white/10 px-2 py-4 text-center"
        >
          <span className="text-2xl">{s.emoji}</span>
          <span className="text-xs font-semibold text-muted">
            {i + 1}. {s.label}
          </span>
        </div>
      ))}
      <p className="col-span-3 mt-3 text-center text-xs text-muted">
        🚫 One veto each. It kills a place outright, however many people wanted it.
      </p>
    </div>
  );
}

/** Live round countdown from an absolute deadline; goes red in the final stretch, then "Deciding…". */
export function RoundCountdown({ endsAt, onTurnOff }: { endsAt: number; onTurnOff?: () => void }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, endsAt - Date.now())), 500);
    return () => clearInterval(t);
  }, [endsAt]);

  if (remaining <= 0) {
    return (
      <p role="status" className="mb-4 text-sm font-semibold text-flare">
        Time’s up. Counting votes…
      </p>
    );
  }
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const low = totalSec <= 10;
  return (
    <p
      className={`mb-4 text-sm font-semibold tabular-nums ${low ? "text-flare animate-pulse" : "text-muted"}`}
    >
      <span aria-hidden>⏱ </span>
      {m}:{new Intl.NumberFormat(undefined, { minimumIntegerDigits: 2 }).format(s)} left
      {onTurnOff && (
        <button type="button" className="ml-3 min-h-11 underline hover:text-cream" onClick={onTurnOff}>
          Turn off timer
        </button>
      )}
    </p>
  );
}
