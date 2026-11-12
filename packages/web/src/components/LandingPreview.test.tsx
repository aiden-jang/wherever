import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReducedMotion } from "framer-motion";
import { LandingPreview } from "./LandingPreview.js";
import { play } from "./sound.js";

vi.mock("framer-motion", async (original) => ({
  ...(await original<typeof import("framer-motion")>()),
  useReducedMotion: vi.fn(() => false),
}));
vi.mock("./sound.js", () => ({ play: vi.fn() }));
vi.mock("./haptics.js", () => ({ buzz: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.mocked(play).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const advance = (milliseconds = 3000) => act(() => vi.advanceTimersByTime(milliseconds));
it("quietly cycles example cards while keeping vote controls in place", () => {
  render(<LandingPreview />);
  const yes = screen.getByRole("button", { name: "Yes, please" });
  expect(screen.getByRole("heading", { name: "Late Night Pizza Decisions" })).toBeTruthy();
  advance();
  expect(screen.getByRole("heading", { name: "Noodle Situation" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Yes, please" })).toBe(yes);
  expect(play).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "Noodle Situation" }).parentElement?.getAttribute("aria-live"),
  ).toBe("off");
  fireEvent.click(yes);
  expect(screen.getByRole("heading", { name: "Probably Fine Tacos" })).toBeTruthy();
  expect(play).toHaveBeenCalledWith("like");
});
it("pauses during hover and keyboard focus, then resumes without a playback control", () => {
  render(<LandingPreview />);
  const preview = screen.getByRole("region", { name: "Example restaurant preview" });
  fireEvent.mouseEnter(preview);
  advance(20_000);
  expect(screen.getByText("1 / 3 examples")).toBeTruthy();
  fireEvent.mouseLeave(preview);
  fireEvent.focus(screen.getByRole("button", { name: "Nope" }));
  advance(20_000);
  expect(screen.getByText("1 / 3 examples")).toBeTruthy();
  fireEvent.blur(screen.getByRole("button", { name: "Nope" }), { relatedTarget: document.body });
  expect(screen.queryByRole("button", { name: /^(Pause|Play) preview$/ })).toBeNull();
  advance();
  expect(screen.getByText("2 / 3 examples")).toBeTruthy();
});
it("suspends behind dialogs and leaves automatic cycling off for reduced motion", () => {
  const view = render(<LandingPreview suspended />);
  advance(20_000);
  expect(screen.getByText("1 / 3 examples")).toBeTruthy();
  view.rerender(<LandingPreview suspended={false} />);
  advance();
  expect(screen.getByText("2 / 3 examples")).toBeTruthy();
  view.unmount();
  vi.mocked(useReducedMotion).mockReturnValue(true);
  render(<LandingPreview />);
  advance(20_000);
  expect(screen.getByText("1 / 3 examples")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Pause preview" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Nope" }));
  expect(screen.getByText("2 / 3 examples")).toBeTruthy();
});
