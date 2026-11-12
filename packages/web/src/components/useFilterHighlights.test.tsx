import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyVibe, DEFAULT_FILTERS, type Vibe } from "@wherever/shared";
import { useFilterHighlights } from "./useFilterHighlights.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("briefly identifies filters changed by a preset without highlighting preserved fields", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ filters, vibe }) => useFilterHighlights(filters, vibe), {
    initialProps: { filters: DEFAULT_FILTERS, vibe: null as Vibe | null },
  });
  rerender({ filters: applyVibe(DEFAULT_FILTERS, "quick"), vibe: "quick" });
  expect(result.current).toEqual(expect.arrayContaining(["radiusMeters", "priceTiers", "sort", "amenities"]));
  expect(result.current).not.toContain("categories");
  act(() => vi.advanceTimersByTime(1800));
  expect(result.current).toEqual([]);
});
