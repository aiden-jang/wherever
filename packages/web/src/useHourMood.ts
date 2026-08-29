import { useEffect, useState } from "react";
import { hourMood, type Mood } from "@wherever/shared";

/**
 * The current mood, re-checked every minute so a session that runs past an hour boundary drifts into
 * the next palette instead of staying stuck on whatever it opened with.
 */
export function useHourMood(): Mood {
  const [mood, setMood] = useState(() => hourMood(new Date().getHours()));
  useEffect(() => {
    const tick = setInterval(() => setMood(hourMood(new Date().getHours())), 60_000);
    return () => clearInterval(tick);
  }, []);
  return mood;
}
