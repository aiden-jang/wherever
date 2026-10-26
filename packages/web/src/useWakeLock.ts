import { useEffect } from "react";

/** Reacquire on visibility changes because browsers release wake locks while hidden. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (
      navigator as Navigator & {
        wakeLock?: {
          request: (t: "screen") => Promise<{ release: () => Promise<void>; released?: boolean }>;
        };
      }
    ).wakeLock;
    if (!active || !api) return;

    let held: { release: () => Promise<void>; released?: boolean } | null = null;
    let dropped = false;
    let pending = false;

    const release = () => {
      void held?.release().catch(() => {});
      held = null;
    };

    const take = async () => {
      if (dropped || document.hidden || pending || (held && !held.released)) return;
      pending = true;
      try {
        const lock = await api.request("screen");
        /* Check again on the way out. The effect can tear down while this request is in flight, and
           a lock that arrives after cleanup has already run is one nobody will ever release: the
           screen then stays awake for the life of the tab. */
        if (dropped || document.hidden) {
          void lock.release().catch(() => {});
          return;
        }
        held = lock;
      } catch {
        /* Refused on low battery, or where the policy forbids it. Nothing to say to anybody: the
           screen behaves the way it always did. */
      } finally {
        pending = false;
      }
    };

    /* Named, not an inline arrow. `removeEventListener` compares by reference, so passing a second
       `() => void take()` removes nothing and leaves a listener per mount. */
    const onVisible = () => {
      if (document.hidden) release();
      else void take();
    };

    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      release();
    };
  }, [active]);
}
