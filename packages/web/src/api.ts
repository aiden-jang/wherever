import type { SessionFilters } from "@wherever/shared";

// Sensible defaults; the create form lets the host adjust these before starting.
export const DEFAULT_FILTERS: SessionFilters = {
  radiusMeters: 8000, // 5 mi
  maxPriceTier: 4,
  categories: [],
  minRating: 0,
  minReviews: 0,
  openNow: false,
  sort: "popularity",
};

// Empty in dev (Vite proxies /api to the Worker); set to the Worker origin in prod.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function createSession(
  displayName: string,
  filters: SessionFilters = DEFAULT_FILTERS,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, filters }),
  });
  if (!res.ok) {
    // Surface the server's specific reason (rate limit, bad setup) instead of a generic one.
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't start the session. Give it another shot.");
  }
  const data = (await res.json()) as { code: string };
  return data.code;
}

/**
 * Best-effort geolocation for the search center. Resolves null if the browser
 * has no geolocation, the user denies it, or it times out, so creation never
 * blocks on it (real sources fall back to a default; mock ignores it).
 */
export function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 600_000 },
    );
  });
}

/** displayName is kept per-tab so a refresh in the lobby does not lose it. */
export function rememberName(name: string): void {
  sessionStorage.setItem("displayName", name);
}

export function recallName(): string {
  return sessionStorage.getItem("displayName") ?? "";
}
