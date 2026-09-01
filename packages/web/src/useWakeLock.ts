import { useEffect } from "react";

/**
 * Keeps the screen awake while a round is live.
 *
 * A group sits around a table with the app open, waiting for whoever is still reading the menu, and
 * every phone in the room dims and locks. Waking it up means unlocking, finding the app, and by then
 * the round has moved. This is the whole feature.
 *
 * Re-requested on `visibilitychange`, which is not optional: the browser drops the lock whenever the
 * tab is hidden and does not give it back on its own, so without this the lock survives exactly one
 * glance at a notification.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const api = (navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (!active || !api) return;

    let held: { release: () => Promise<void> } | null = null;
    let dropped = false;

    const take = async () => {
      if (dropped || document.hidden) return;
      try {
        const lock = await api.request("screen");
        /* Check again on the way out. The effect can tear down while this request is in flight, and
           a lock that arrives after cleanup has already run is one nobody will ever release: the
           screen then stays awake for the life of the tab. */
        if (dropped) {
          void lock.release().catch(() => {});
          return;
        }
        held = lock;
      } catch {
        /* Refused on low battery, or where the policy forbids it. Nothing to say to anybody: the
           screen behaves the way it always did. */
      }
    };

    /* Named, not an inline arrow. `removeEventListener` compares by reference, so passing a second
       `() => void take()` removes nothing and leaves a listener per mount. */
    const onVisible = () => void take();

    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void held?.release().catch(() => {});
    };
  }, [active]);
}
