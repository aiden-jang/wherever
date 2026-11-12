import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_FILTERS, REACTION_EMOJIS } from "@wherever/shared";
import { initialSessionState } from "../sessionState.js";
import type { useSessionSocket } from "../useSessionSocket.js";
import { SwipingRoom } from "./SwipingRoom.js";

vi.mock("./sound.js", () => ({ play: vi.fn() }));
vi.mock("./haptics.js", () => ({ buzz: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function stateFor(totalParticipants: number): ReturnType<typeof useSessionSocket> {
  return {
    ...initialSessionState,
    status: "open",
    everConnected: true,
    send: vi.fn(() => true),
    progress: { finishedCount: 0, totalParticipants, votesCast: 0 },
    session: {
      id: "ABCDEF",
      code: "ABCDEF",
      status: "swiping",
      voteMode: "majority",
      filters: DEFAULT_FILTERS,
      participants: Array.from({ length: totalParticipants }, (_, i) => ({
        id: String(i),
        displayName: `Person ${i}`,
        isHost: i === 0,
        connected: true,
      })),
    },
    deck: ["Pizza", "Ramen"].map((name) => ({
      id: name,
      name,
      category: "pizza",
      priceTier: 2,
      rating: 4.5,
      reviewCount: 10,
      distanceMeters: 100,
      imageUrl: null,
      address: null,
    })),
  };
}
function room(
  state: ReturnType<typeof useSessionSocket>,
  isHost = true,
  onAnnounce: (text: string) => void = () => {},
) {
  return (
    <MemoryRouter>
      <SwipingRoom
        state={state}
        isHost={isHost}
        onAnnounce={onAnnounce}
        chrome={{
          announcement: "",
          toasts: [],
          reactions: [],
          roster: state.session!.participants,
          demo: null,
        }}
      />
    </MemoryRouter>
  );
}
it("keeps solo voting free of group prompts and adds group progress when another person joins", () => {
  const state = stateFor(1);
  const { rerender } = render(room(state));
  const rail = document.querySelector(".table-rail")! as HTMLElement;
  expect(within(rail).queryByText(/done/)).toBeNull();
  expect(within(rail).queryByRole("button", { name: "Send a nudge" })).toBeNull();
  expect(within(rail).queryByRole("button", { name: "Decide now" })).toBeNull();
  expect(within(rail).getAllByRole("button", { name: /^React / })).toHaveLength(REACTION_EMOJIS.length);
  rerender(room({ ...state, progress: { finishedCount: 0, totalParticipants: 2, votesCast: 1 } }));
  expect(within(rail).getByText("0 of 2 done")).toBeTruthy();
  expect(within(rail).getByText("vote", { exact: false })).toBeTruthy();
  expect(within(rail).getByRole("button", { name: "Send a nudge" })).toBeTruthy();
  rerender(room(state));
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  fireEvent.click(screen.getByRole("button", { name: "Nope" }));
  expect(screen.getByRole("heading", { name: "Finding your dinner" })).toBeTruthy();
  expect(screen.queryByText("Waiting for the group")).toBeNull();
});
it("keeps nudge cooldown and two-step early decisions when host actions move below progress", () => {
  const state = stateFor(2);
  render(room(state));
  fireEvent.click(screen.getByRole("button", { name: "Send a nudge" }));
  expect(state.send).toHaveBeenCalledWith({ type: "nudge_them" });
  expect(screen.getByRole<HTMLButtonElement>("button", { name: /Nudge sent/ }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Decide now" }));
  expect(state.send).not.toHaveBeenCalledWith({ type: "decide_now" });
  fireEvent.click(screen.getByRole("button", { name: "Wait" }));
  expect(screen.queryByRole("button", { name: "Decide anyway" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Decide now" }));
  fireEvent.click(screen.getByRole("button", { name: "Decide anyway" }));
  expect(state.send).toHaveBeenCalledWith({ type: "decide_now" });
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  expect(screen.getByRole("heading", { name: "Waiting for the group" })).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: /Nudge sent/ }).disabled).toBe(true);
});
it("shows group progress to guests without host actions and disables host actions while offline", () => {
  const state = stateFor(2);
  const { rerender } = render(room(state, false));
  expect(screen.getByText("0 of 2 done")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send a nudge" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decide now" })).toBeNull();
  rerender(room({ ...state, status: "connecting" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Send a nudge" }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Decide now" }).disabled).toBe(true);
});

it("updates the final announcement when a group becomes a solo round", () => {
  const state = stateFor(2);
  const announce = vi.fn();
  const { rerender } = render(room(state, true, announce));
  rerender(
    room({ ...state, progress: { finishedCount: 0, totalParticipants: 1, votesCast: 0 } }, true, announce),
  );
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  fireEvent.click(screen.getByRole("button", { name: "Nope" }));
  expect(announce.mock.lastCall?.[0]).toContain("Choosing your dinner.");
  expect(announce.mock.lastCall?.[0]).not.toContain("Waiting for the group");
});
