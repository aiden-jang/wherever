import type { SessionFilters } from "@wherever/shared";

// Sensible defaults until the filter UI lands (Phase 2).
export const DEFAULT_FILTERS: SessionFilters = {
  radiusMeters: 5000,
  maxPriceTier: 4,
  categories: [],
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
  if (!res.ok) throw new Error("Could not start a session. Try again.");
  const data = (await res.json()) as { code: string };
  return data.code;
}

/** displayName is kept per-tab so a refresh in the lobby does not lose it. */
export function rememberName(name: string): void {
  sessionStorage.setItem("displayName", name);
}

export function recallName(): string {
  return sessionStorage.getItem("displayName") ?? "";
}
