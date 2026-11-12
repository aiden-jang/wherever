import { useEffect, useRef, useState } from "react";
import { vibeOption, type SessionFilters, type Vibe } from "@wherever/shared";

export function useFilterHighlights(filters: SessionFilters, vibe: Vibe | null) {
  const previous = useRef(filters);
  const [changed, setChanged] = useState<(keyof SessionFilters)[]>([]);
  useEffect(() => {
    const keys = vibe ? (Object.keys(vibeOption(vibe).filters) as (keyof SessionFilters)[]) : [];
    const updated = keys.filter(
      (key) => JSON.stringify(previous.current[key]) !== JSON.stringify(filters[key]),
    );
    previous.current = filters;
    setChanged(updated);
    if (!updated.length) return;
    const timer = setTimeout(() => setChanged([]), 1800);
    return () => clearTimeout(timer);
  }, [filters, vibe]);
  return changed;
}
