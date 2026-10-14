import { exports as workers, env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { sessions } from "../src/db/schema.js";
import type { Env } from "../src/env.js";

// The test worker's bindings (local D1 + the Durable Objects), typed as the app's Env.
const testEnv = env as unknown as Env;
const BASE = "https://wherever.test";

const validBody = () => ({
  displayName: "Alex",
  filters: { radiusMeters: 5000, maxPriceTier: 3, categories: ["pizza"] },
});

async function createSession(body: unknown = validBody()): Promise<Response> {
  return workers.default.fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sessions", () => {
  it("creates a session end to end: mints a 6-char code, persists it to D1, seeds the room", async () => {
    const res = await createSession();
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: string };
    expect(code).toHaveLength(6);

    // The row is really in D1 with the parsed filters (exercises the Drizzle insert + migration).
    const row = await drizzle(testEnv.DB).select().from(sessions).where(eq(sessions.code, code)).get();
    expect(row).toBeTruthy();
    expect(row!.status).toBe("lobby");
    expect(JSON.parse(row!.filters) as { categories: string[] }).toMatchObject({ categories: ["pizza"] });
  });

  it("rejects an invalid body with 400", async () => {
    expect((await createSession({ displayName: "", filters: {} })).status).toBe(400);
    expect((await createSession(null)).status).toBe(400);
  });

  it("rate-limits repeated creates from one IP with 429", async () => {
    let saw429 = false;
    for (let i = 0; i < 14; i++) {
      if ((await createSession()).status === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});

describe("GET /api/health", () => {
  it("reports ok and the configured source", async () => {
    const res = await workers.default.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; source: string };
    expect(body.ok).toBe(true);
    expect(body.source).toBe("mock");
  });
});
