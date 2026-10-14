import { useCallback, useLayoutEffect, useRef, useState } from "react";

type Status = "sharing" | "shared" | "copied" | "failed" | null;

/** Feedback belongs to the surface that started it; closing a native sheet is a cancellation. */
export function useShareAction(key: string) {
  const [status, setStatus] = useState<Status>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useLayoutEffect(() => {
    generation.current += 1;
    busy.current = false;
    setStatus(null);
    clearTimeout(timer.current);
    return () => {
      generation.current += 1;
      busy.current = false;
      clearTimeout(timer.current);
    };
  }, [key]);
  const share = useCallback(async (data: ShareData, native = true) => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(timer.current);
    const request = generation.current;
    const current = () => request === generation.current;
    const finish = (next: Status) => {
      if (!current()) return;
      busy.current = false;
      setStatus(next);
      if (next) timer.current = setTimeout(() => setStatus(null), 2200);
    };
    setStatus("sharing");
    if (native && typeof navigator.share === "function") {
      try {
        await navigator.share(data);
        finish("shared");
        return;
      } catch (error) {
        if (!current()) return;
        if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
          finish(null);
          return;
        }
      }
    }
    if (!current()) return;
    try {
      await navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join("\n"));
      finish("copied");
    } catch {
      finish("failed");
    }
  }, []);
  return { status, share };
}
