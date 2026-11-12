import { useEffect, useState, useSyncExternalStore } from "react";
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

function subscribeToNetwork(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

const isOnline = () => navigator.onLine;

export function JoiningRoom({ connectionClosed }: { connectionClosed: boolean }) {
  const online = useSyncExternalStore(subscribeToNetwork, isOnline);
  const message = !online
    ? "Waiting for internet. You’ll join automatically when you reconnect."
    : connectionClosed
      ? "Couldn’t connect to the room."
      : "Connecting…";
  return (
    <main id="main-content" tabIndex={-1} className="table-room">
      <h1 className="table-title">Joining the dinner room</h1>
      <p role="status">{message}</p>
      {online && connectionClosed && <DisconnectBanner reconnecting={false} />}
    </main>
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
