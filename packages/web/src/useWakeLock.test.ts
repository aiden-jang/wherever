import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useWakeLock } from "./useWakeLock.js";

let hidden = false;
const request = vi.fn();
beforeEach(() => {
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  request.mockReset();
  Reflect.deleteProperty(navigator, "wakeLock");
});

test("visibility events share an outstanding wake-lock request", () => {
  request.mockReturnValue(new Promise(() => {}));
  renderHook(() => useWakeLock(true));
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test("a wake lock arriving after the page hides is released", async () => {
  let resolve!: (lock: { release: () => Promise<void> }) => void;
  request.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  renderHook(() => useWakeLock(true));
  hidden = true;
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  const release = vi.fn().mockResolvedValue(undefined);
  await act(async () => resolve({ release }));
  expect(release).toHaveBeenCalledOnce();
});

test("an already held lock is reused and released when leaving the room", async () => {
  const release = vi.fn().mockResolvedValue(undefined);
  request.mockResolvedValue({ release, released: false });
  const hook = renderHook(() => useWakeLock(true));
  await act(async () => {});
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  await act(async () => {});
  expect(request).toHaveBeenCalledOnce();
  hook.unmount();
  expect(release).toHaveBeenCalledOnce();
});
