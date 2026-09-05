import { useEffect, useRef, useState } from "react";
import type { Participant } from "@wherever/shared";
import { play } from "./sound.js";

/*
 * Everything that says a thing once and then goes away: the stack itself, and the three rules for
 * what earns a place in it.
 *
 * Lifted out of the lobby because none of it is about the lobby. It is the same shape three times —
 * notice a change, say it, forget it — and it was three quarters of the state in a file whose real
 * job is running a round.
 */

export interface Toast {
  id: string;
  text: string;
}

/** Fixed toast stack for join/leave events. */
export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-40 flex flex-col items-center gap-2 px-4 pad-safe-top [--pad:1rem]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pop-in rounded-full bg-ink-soft/95 border border-white/10 px-4 py-2 text-sm font-medium shadow-lifted"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Toasts when someone joins or leaves, by diffing the participant list across session_state
 * pushes. The first snapshot seeds silently so existing members don't all toast on load.
 */
export function useJoinLeaveToasts(
  participants: Participant[] | undefined,
  onEvent?: (text: string) => void,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<Map<string, string> | null>(null);
  // Keep the latest callback without re-running the diff effect when it changes identity.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!participants) return;
    const curr = new Map(participants.map((p) => [p.id, p.displayName]));
    const before = prev.current;
    prev.current = curr;
    if (before === null) return; // seed silently

    const events: string[] = [];
    for (const [id, name] of curr) if (!before.has(id)) events.push(`${name} joined`);
    for (const [id, name] of before) if (!curr.has(id)) events.push(`${name} left`);
    if (events.length === 0) return;

    onEventRef.current?.(events.join(". "));
    if (curr.size > before.size) play("join");
    const added = events.map((text) => ({ id: crypto.randomUUID(), text }));
    setToasts((t) => [...t, ...added]);
    const ids = new Set<string>(added.map((a) => a.id));
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 3000);
  }, [participants]);

  return toasts;
}

/**
 * A one-off toast when *you* become the host (the previous host left and the server handed it off).
 * Seeds silently once the session is known, so the original host isn't toasted on load.
 */
export function useHostPromotionToasts(
  isHost: boolean,
  ready: boolean,
  onEvent?: (text: string) => void,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prev = useRef<boolean | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!ready) return;
    const before = prev.current;
    prev.current = isHost;
    if (before === null) return; // seed silently on first known state
    if (before || !isHost) return; // only fire on a false -> true handoff

    const text = "You're the host now. You can start swiping.";
    onEventRef.current?.(text);
    const toast = { id: crypto.randomUUID(), text };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 4000);
  }, [isHost, ready]);

  return toasts;
}

/*
 * Say a thing once, when it becomes true, and never again for the same words. The deck screen has to
 * explain two things without spending a permanent row on either: what the vibe did to the filters,
 * and that you walked in on a round already under way.
 */
export function useOneShotToast(
  text: string | null,
  onEvent?: (text: string) => void,
  /** What counts as "the same thing again". Defaults to the words; errors key on a counter instead. */
  key: string | null = text,
): Toast[] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const said = useRef<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!text || !key || said.current === key) return;
    said.current = key;
    onEventRef.current?.(text);
    const toast = { id: crypto.randomUUID(), text };
    setToasts((t) => [...t, toast]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 5000);
  }, [key, text]);

  return toasts;
}
