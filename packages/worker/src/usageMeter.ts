import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

export type UsageKind = "search" | "photo";

interface UsageState {
  /** "YYYY-MM" (UTC) the counts belong to; a change resets them. */
  month: string;
  search: number;
  photo: number;
}

// Just under Google's 1,000/month free tier for Nearby Search (Enterprise) and Place Photos, with
// margin so a burst near month-end can't overshoot. Overridable via wrangler [vars].
const DEFAULT_CAP = 950;

/**
 * Global monthly circuit breaker for paid Google calls. A single instance (idFromName("global"))
 * counts Nearby Search and Place Photo calls per calendar month; once a kind hits its cap the caller
 * skips the Google request and serves a fallback, so usage stays inside the free tier and the bill
 * stays at zero. Counts reset automatically at the start of each UTC month.
 *
 * This covers every paid path because all Google calls funnel through the Worker (search in the
 * session DO, photos through /api/photo). It's the app-level guard; a Google Cloud quota cap is the
 * belt-and-suspenders backstop.
 */
export class UsageMeter extends DurableObject<Env> {
  private caps(): Record<UsageKind, number> {
    return {
      search: Number(this.env.SEARCH_MONTHLY_CAP) || DEFAULT_CAP,
      photo: Number(this.env.PHOTO_MONTHLY_CAP) || DEFAULT_CAP,
    };
  }

  private static currentMonth(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  /** Load this month's counts, treating a stale (previous-month) record as zero. */
  private async load(): Promise<UsageState> {
    const month = UsageMeter.currentMonth();
    const stored = await this.ctx.storage.get<UsageState>("usage");
    if (!stored || stored.month !== month) return { month, search: 0, photo: 0 };
    return stored;
  }

  /**
   * Atomically reserve one call of `kind` for the current month. Returns false once the cap is
   * reached (caller must then skip the Google request). The DO's single-threaded execution makes
   * the read-modify-write race-free.
   */
  async tryConsume(kind: UsageKind): Promise<boolean> {
    const state = await this.load();
    if (state[kind] >= this.caps()[kind]) return false;
    state[kind] += 1;
    await this.ctx.storage.put("usage", state);
    return true;
  }

  /** Current month's usage and caps, for the /api/usage view. */
  async stats(): Promise<UsageState & { caps: Record<UsageKind, number> }> {
    return { ...(await this.load()), caps: this.caps() };
  }
}
