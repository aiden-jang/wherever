import type { SessionFilters } from "@wherever/shared";
import { DEFAULT_FILTERS } from "@wherever/shared";

export { DEFAULT_FILTERS };

// The Worker serves the app and API on one origin; local builds may override it.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  const deadline = AbortSignal.timeout(15_000);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn’t reach Wherever. Check your connection and try again.");
  }
}

export async function createSession(
  displayName: string,
  filters: SessionFilters = DEFAULT_FILTERS,
  signal?: AbortSignal,
): Promise<string> {
  const res = await request(
    "/api/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, filters }),
    },
    signal,
  );
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
 * Resolve a zip/town through the Worker, which holds the provider key. Short queries
 * return null; rejected searches throw the server's reason for retry feedback.
 * `label` is the provider's formatted address.
 */
export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  const res = await request(`/api/geocode?q=${encodeURIComponent(q)}`, {}, signal);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Location search is unavailable. Try again shortly.");
  }
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
