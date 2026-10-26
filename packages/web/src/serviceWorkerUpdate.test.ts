import source from "../public/sw.js?raw";
import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";

test("explicit no-store update checks bypass the installed shell cache", () => {
  const handlers = new Map<string, (event: unknown) => void>();
  runInNewContext(source, {
    URL,
    caches: { match: () => Promise.resolve({}) },
    fetch: () => Promise.resolve({ ok: false }),
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
  });
  const respondWith = vi.fn();
  handlers.get("fetch")!({
    request: { url: "https://app.test/", method: "GET", cache: "no-store" },
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
});

function installedWorker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const put = vi.fn().mockResolvedValue(undefined);
  const match = vi.fn().mockResolvedValue(undefined);
  const response = { ok: true, headers: { get: () => "text/html" }, clone: () => ({ body: "copy" }) };
  const fetch = vi.fn().mockResolvedValue(response);
  runInNewContext(source, {
    URL,
    caches: { match, open: async () => ({ put }) },
    fetch,
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
  });
  const visit = async (path: string, mode = "navigate") => {
    let reply: Promise<unknown> | undefined;
    const work: Promise<unknown>[] = [];
    const respondWith = vi.fn((promise: Promise<unknown>) => {
      reply = promise;
    });
    handlers.get("fetch")!({
      request: { url: new URL(path, "https://app.test").href, method: "GET", mode },
      respondWith,
      waitUntil: (promise: Promise<unknown>) => work.push(promise),
    });
    const result = await reply;
    await Promise.all(work);
    return { result, respondWith, work };
  };
  return { put, fetch, match, response, visit };
}

test.each(["/s/ABCDEF", "/share?url=private-invite"])(
  "%s cannot replace the public offline shell",
  async (path) => {
    const worker = installedWorker();
    await worker.visit(path);
    expect(worker.put).not.toHaveBeenCalled();
  },
);

test("cross-origin assets remain outside the app cache", async () => {
  const worker = installedWorker();
  const event = await worker.visit("https://other.test/photo.jpg", "cors");
  expect(event.respondWith).not.toHaveBeenCalled();
  expect(worker.fetch).not.toHaveBeenCalled();
});

test("cached fingerprinted assets do not start another download", async () => {
  const worker = installedWorker();
  const cached = { body: "verified asset" };
  worker.match.mockResolvedValue(cached);
  const event = await worker.visit("/assets/index-aBcDe123.js", "cors");
  expect(event.result).toBe(cached);
  expect(worker.fetch).not.toHaveBeenCalled();
});

test("the public shell cache write extends the event lifetime", async () => {
  const worker = installedWorker();
  const event = await worker.visit("/");
  expect(worker.put).toHaveBeenCalledWith("/", { body: "copy" });
  expect(event.work.length).toBeGreaterThan(0);
});
