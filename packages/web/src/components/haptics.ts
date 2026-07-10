/**
 * Best-effort haptic feedback. Silently a no-op where the Vibration API is unsupported
 * (desktop, iOS Safari), so callers never need to guard.
 */
export function buzz(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw if called outside a user gesture; ignore.
    }
  }
}
