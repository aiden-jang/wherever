import { useState } from "react";
import { line, type Moment } from "@wherever/shared";

/** Keep the aside steady while progress elsewhere on the screen changes. */
export function useLine(moment: Moment): string {
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  return line(moment, seed);
}
