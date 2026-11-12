import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLine } from "./useLine.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("keeps the waiting aside stable through time and unrelated updates", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(() => useLine("waiting"));
  const initial = result.current;
  act(() => vi.advanceTimersByTime(20000));
  rerender();
  expect(result.current).toBe(initial);
  expect(vi.getTimerCount()).toBe(0);
});
