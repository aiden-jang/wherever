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
  const addAll = vi.fn().mockResolvedValue(undefined);
  const html =
    '<html lang="en"><meta name="wherever-offline-shell" content="4"><link rel="icon" href="/icon.svg"><script src="/assets/index-aBcDe123.js"></script><link href="/assets/index-xYz09876.css"></html>';
  const response = {
    ok: true,
    headers: { get: () => "text/html" },
    text: async () => html,
    clone() {
      return { ...this };
    },
  };
  const fetch = vi.fn().mockResolvedValue(response);
  const skipWaiting = vi.fn();
  runInNewContext(source, {
    URL,
    caches: { match, open: async () => ({ addAll, match, put, keys: async () => [] }) },
    fetch,
    setTimeout: (callback: () => void) => callback(),
    self: {
      location: { origin: "https://app.test" },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
      skipWaiting,
    },
  });
  const install = async () => {
    const work: Promise<unknown>[] = [];
    handlers.get("install")!({ waitUntil: (promise: Promise<unknown>) => work.push(promise) });
    await Promise.all(work);
  };
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
  const previous = { ...response, text: async () => html.replace('content="4"', 'content="3"') };
  return { addAll, put, fetch, match, response, previous, install, skipWaiting, visit };
}

test("installation waits for the homepage from the same release", async () => {
  const worker = installedWorker();
  worker.fetch.mockResolvedValueOnce(worker.previous);
  await worker.install();
  expect(worker.fetch).toHaveBeenCalledTimes(2);
  expect(worker.addAll).toHaveBeenCalledOnce();
  expect(worker.put).toHaveBeenCalledExactlyOnceWith("/", worker.response);
  expect(worker.skipWaiting).toHaveBeenCalledOnce();
});

test("persistent stale HTML leaves the previous worker active", async () => {
  const worker = installedWorker();
  worker.fetch.mockResolvedValue(worker.previous);
  await expect(worker.install()).rejects.toThrow("Matching offline shell is not available yet");
  expect(worker.put).not.toHaveBeenCalled();
  expect(worker.skipWaiting).not.toHaveBeenCalled();
});

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
  expect(worker.addAll).toHaveBeenCalledWith([
    "/icon.svg",
    "/assets/index-aBcDe123.js",
    "/assets/index-xYz09876.css",
  ]);
  expect(worker.put).toHaveBeenCalledWith("/", worker.response);
  expect(event.work.length).toBeGreaterThan(0);
});

test("an incomplete replacement cannot overwrite the working offline shell", async () => {
  const worker = installedWorker();
  worker.addAll.mockRejectedValueOnce(new Error("Connection dropped"));
  const event = await worker.visit("/");
  expect(event.result).toBe(worker.response);
  expect(worker.put).not.toHaveBeenCalled();

  await worker.visit("/");
  expect(worker.put).toHaveBeenCalledWith("/", worker.response);
});
