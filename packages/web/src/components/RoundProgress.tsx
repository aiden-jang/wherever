import { useEffect, useState } from "react";
import { decideNowWarning, NUDGE_COOLDOWN_MS, type ClientMessage } from "@wherever/shared";
import type { Progress } from "../sessionState.js";

export function RoundProgress({
  progress,
  isHost,
  disabled,
  send,
}: {
  progress: Progress;
  isHost: boolean;
  disabled: boolean;
  send: (message: ClientMessage) => boolean;
}) {
  const [confirmDecide, setConfirmDecide] = useState(false);
  const [hurriedAt, setHurriedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // The server enforces the cooldown; this timer explains when the action becomes available.
  useEffect(() => {
    if (!hurriedAt) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current - hurriedAt >= NUDGE_COOLDOWN_MS) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [hurriedAt]);
  const hurryWait = Math.max(0, NUDGE_COOLDOWN_MS / 1000 - Math.floor((now - hurriedAt) / 1000));
  const unfinished = progress.finishedCount < progress.totalParticipants;

  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-cream tabular-nums">
        {progress.finishedCount} of {progress.totalParticipants} done
      </p>
      {isHost && unfinished && (
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          {confirmDecide ? (
            <>
              <p className="w-full pt-2 text-cream">
                {decideNowWarning(progress.finishedCount, progress.totalParticipants)}
              </p>
              <button
                disabled={disabled}
                onClick={() => {
                  if (send({ type: "decide_now" })) setConfirmDecide(false);
                }}
                className="min-h-11 font-semibold text-acid underline enabled:hover:text-cream disabled:opacity-60"
              >
                Decide anyway
              </button>
              <button onClick={() => setConfirmDecide(false)} className="min-h-11 underline hover:text-cream">
                Wait
              </button>
            </>
          ) : (
            <>
              <button
                disabled={hurryWait > 0 || disabled}
                onClick={() => {
                  if (!send({ type: "nudge_them" })) return;
                  setHurriedAt(Date.now());
                  setNow(Date.now());
                }}
                className="min-h-11 underline hover:text-cream disabled:no-underline disabled:opacity-50"
              >
                {hurryWait > 0 ? `hurried (${hurryWait}s)` : "hurry them"}
              </button>
              <button
                disabled={disabled}
                onClick={() => setConfirmDecide(true)}
                className="min-h-11 underline enabled:hover:text-cream disabled:opacity-60"
              >
                just decide now
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
