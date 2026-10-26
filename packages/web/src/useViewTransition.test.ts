import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useTransitionNavigate } from "./useViewTransition.js";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: false })));
afterEach(() => {
  cleanup();
  navigate.mockReset();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "startViewTransition");
});

test("navigation continues if the browser refuses to start a view transition", () => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: () => {
      throw new Error("Renderer unavailable");
    },
  });
  const hook = renderHook(() => useTransitionNavigate());
  expect(() => act(() => hook.result.current("/s/ABCDEF"))).not.toThrow();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/s/ABCDEF");
});

test("a transition failure after its update cannot navigate twice", () => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      update();
      throw new Error("Snapshot unavailable");
    },
  });
  const hook = renderHook(() => useTransitionNavigate());
  expect(() => act(() => hook.result.current("/s/ABCDEF"))).not.toThrow();
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/s/ABCDEF");
});
