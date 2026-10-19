import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.js";

export type UsageKind = "search" | "photo" | "geocode";

interface UsageState {
  /** Google's billing month, YYYY-MM in America/Los_Angeles. */
  month: string;
  search: number;
  photo: number;
  geocode: number;
}

const MAX_CAP = 950;

function monthlyCap(value: string | undefined): number {
  if (value === undefined) return MAX_CAP;
  if (!/^\d+$/.test(value.trim())) return 0;
  const cap = Number(value);
  return Number.isSafeInteger(cap) ? Math.min(cap, MAX_CAP) : 0;
}

/* Reserve before contacting Google. Failed attempts also consume budget; cached responses do not. */
export class UsageMeter extends DurableObject<Env> {
  private caps(): Record<UsageKind, number> {
    return {
      search: monthlyCap(this.env.SEARCH_MONTHLY_CAP),
      photo: monthlyCap(this.env.PHOTO_MONTHLY_CAP),
      geocode: monthlyCap(this.env.GEOCODE_MONTHLY_CAP),
    };
  }

  private static currentMonth(): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    return ["year", "month"].map((type) => parts.find((part) => part.type === type)!.value).join("-");
  }

  /** Load this month's counts, treating a stale (previous-month) record as zero. */
  private async load(
    storage: DurableObjectStorage | DurableObjectTransaction = this.ctx.storage,
  ): Promise<UsageState> {
    const month = UsageMeter.currentMonth();
    const stored = await storage.get<UsageState>("usage");
    if (!stored || stored.month !== month) return { month, search: 0, photo: 0, geocode: 0 };
    // Preserve existing search/photo reservations when adding the geocoding counter.
    return { ...stored, geocode: stored.geocode ?? 0 };
  }

  /**
   * Atomically reserve one call of `kind` for the current month. Returns false once the cap is
   * reached (caller must then skip the Google request). Commit before granting a reservation.
   */
  async tryConsume(kind: UsageKind): Promise<boolean> {
    return this.ctx.storage.transaction(async (storage) => {
      const state = await this.load(storage);
      if (state[kind] >= this.caps()[kind]) return false;
      state[kind] += 1;
      await storage.put("usage", state);
      return true;
    });
  }

  /** Current month's usage and caps, for the /api/usage view. */
  async stats(): Promise<UsageState & { caps: Record<UsageKind, number> }> {
    return { ...(await this.load()), caps: this.caps() };
  }
}
