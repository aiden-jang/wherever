import { useEffect, useState } from "react";
import { line, type Moment } from "@wherever/shared";

/**
 * A line for this moment that changes every `ms`. Waiting is the part of the night this app exists
 * to shorten, so the screens people wait on are the ones that have to keep talking.
 */
export function useLine(moment: Moment, ms = 3200): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return line(moment, i);
}
