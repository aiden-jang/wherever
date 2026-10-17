import { useEffect, useState } from "react";
import type { DemoReason } from "@wherever/shared";

/*
 * What the room is doing, said in the small print: the connection, the deck's provenance, the rules,
 * and the clock. None of it is about who is here — that is LobbyPeople.
 */

export function DisconnectBanner({ reconnecting }: { reconnecting: boolean }) {
  if (reconnecting) {
    return (
      <div className="fixed top-0 inset-x-0 z-40 bg-white/10 backdrop-blur text-cream text-center text-sm font-medium py-2 pad-safe-top [--pad:0.5rem]">
        Connection dropped. Reconnecting...
      </div>
    );
  }
  return (
    <div className="fixed top-0 inset-x-0 z-40 bg-flare/90 text-ink text-center text-sm font-medium py-2 pad-safe-top [--pad:0.5rem]">
      Still can&apos;t reach the session.{" "}
      <button onClick={() => location.reload()} className="underline font-semibold">
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
    <div className="w-full max-w-sm mx-auto mb-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm">
      <p className="font-semibold text-cream">Demo mode: sample restaurants.</p>
      <p className="mt-0.5 text-muted">
        {reason === "budget"
          ? "This project hit its monthly Google API budget, so the live data is off. Everything still works; real spots are back on the 1st."
          : "No live restaurant source is configured, so these are stand-ins. Everything else works exactly the same."}
      </p>
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    { emoji: "👆", label: "Everyone swipes" },
    { emoji: "🗳️", label: "Majority rules" },
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
export function RoundCountdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, endsAt - Date.now())), 500);
    return () => clearInterval(t);
  }, [endsAt]);

  if (remaining <= 0) {
    return <p className="mb-4 text-sm font-semibold text-flare">Time! Deciding…</p>;
  }
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const low = totalSec <= 10;
  return (
    <p
      className={`mb-4 text-sm font-semibold tabular-nums ${low ? "text-flare animate-pulse" : "text-muted"}`}
    >
      ⏱ {m}:{String(s).padStart(2, "0")} left
    </p>
  );
}
