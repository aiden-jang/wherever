import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DEFAULT_FILTERS } from "@wherever/shared";
import { useSessionSocket } from "../useSessionSocket.js";
import { initialSessionState } from "../sessionState.js";
import Lobby from "./Lobby.js";

vi.mock("../useSessionSocket.js", () => ({ useSessionSocket: vi.fn() }));
vi.mock("../components/RoomInvite.js", () => ({ RoomInvite: () => <aside>Invite to this room</aside> }));
vi.mock("../components/sound.js", () => ({ play: vi.fn() }));
vi.mock("../components/haptics.js", () => ({ buzz: vi.fn() }));
beforeEach(() => {
  sessionStorage.setItem("displayName", "Alex");
  vi.mocked(useSessionSocket).mockReturnValue({
    ...initialSessionState,
    status: "open",
    everConnected: true,
    participantId: "self",
    send: vi.fn(() => true),
    session: {
      id: "ABCDEF",
      code: "ABCDEF",
      status: "lobby",
      voteMode: "majority",
      filters: { ...DEFAULT_FILTERS, area: "west-village" },
      participants: [{ id: "self", displayName: "Alex", isHost: true, connected: true }],
    },
  });
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
function setup() {
  return render(
    <MemoryRouter initialEntries={["/s/ABCDEF"]}>
      <Routes>
        <Route path="/s/:code" element={<Lobby />} />
      </Routes>
    </MemoryRouter>,
  );
}
it("opens group preferences above the host's dinner filters and still allows both to collapse", () => {
  setup();
  const summary = screen.getByText("Group preferences", { exact: true });
  const preferences = summary.closest("details")!;
  const filters = screen.getByRole("heading", { name: "Dinner filters" }).closest("section")!;
  expect(preferences.open).toBe(true);
  expect(screen.queryByRole("button", { name: /NYC neighborhoods/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Change area" }));
  expect(screen.getByRole("button", { name: "NYC neighborhoods West Village" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close area settings" }));
  expect(screen.getByRole("region", { name: "Group vibe" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Done editing" }).getAttribute("aria-expanded")).toBe("true");
  expect(preferences.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("button", { name: /^More filters/ }).getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(summary);
  expect(preferences.open).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
  expect(screen.getByRole("button", { name: "Edit dinner filters" }).getAttribute("aria-expanded")).toBe(
    "false",
  );
});
it("keeps group preferences available to guests without exposing the host's filter editor", () => {
  const state = vi.mocked(useSessionSocket).getMockImplementation()!("ABCDEF", "Alex");
  vi.mocked(useSessionSocket).mockReturnValue({
    ...state,
    session: {
      ...state.session!,
      participants: [{ id: "self", displayName: "Alex", isHost: false, connected: true }],
    },
  });
  setup();
  expect(screen.getByText("Group preferences").closest("details")!.open).toBe(true);
  expect(screen.queryByRole("button", { name: "Done editing" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Edit dinner filters" })).toBeNull();
});
