import { afterEach, expect, test, vi } from "vitest";
import { createSession, DEFAULT_FILTERS, geocode } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

test.each([404, 429, 503])("location HTTP %s is a retryable failure, not an empty match", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: "Location search is unavailable. Try again shortly." }),
    }),
  );
  await expect(geocode("Denver")).rejects.toThrow("Location search is unavailable");
});

test("an empty successful location search still returns no match", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
  await expect(geocode("No Such Town")).resolves.toBeNull();
});

test.each([new TypeError("Failed to fetch"), new DOMException("Timed out", "TimeoutError")])(
  "connection and deadline failures explain how to recover",
  async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(createSession("Alex")).rejects.toThrow("Check your connection and try again");
    await expect(geocode("Denver")).rejects.toThrow("Check your connection and try again");
  },
);

test("closing a create form can cancel its session request", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url, init: RequestInit) =>
      init.signal?.aborted
        ? Promise.reject(init.signal.reason)
        : Promise.resolve({ ok: true, json: async () => ({ code: "ABCDEF" }) }),
    ),
  );
  const controller = new AbortController();
  controller.abort(new DOMException("Closed", "AbortError"));
  await expect(createSession("Alex", DEFAULT_FILTERS, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
