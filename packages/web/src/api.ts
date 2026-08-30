import type { SessionFilters } from "@wherever/shared";
import { DEFAULT_FILTERS } from "@wherever/shared";

export { DEFAULT_FILTERS };


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

/**
 * Geocode a manually-entered zip/town to a search center via the Worker (which holds the Google
 * key). Returns null on a bad/empty query or no match, so the caller can show a friendly message
 * without a throw. `label` is Google's formatted address, for display.
 */
export async function geocode(
  query: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as {
    lat: number;
    lng: number;
    label: string;
  } | null;
}

/*
 * displayName is kept per-tab so a refresh in the lobby does not lose it.
 *
 * Guarded like every localStorage call in this app: reading storage at all throws where a browser
 * has blocked site data, and forgetting a name is not worth a blank page.
 */
export function rememberName(name: string): void {
  try {
    sessionStorage.setItem("displayName", name);
  } catch {
    // Storage blocked. They will be asked for a name again after a refresh.
  }
}

export function recallName(): string {
  try {
    return sessionStorage.getItem("displayName") ?? "";
  } catch {
    return "";
  }
}
