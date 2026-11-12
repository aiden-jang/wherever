import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSession, getLocation } from "../api.js";
import Landing from "./Landing.js";

vi.mock("../api.js", async (original) => ({
  ...(await original<typeof import("../api.js")>()),
  createSession: vi.fn().mockResolvedValue("ABCDEF"),
  getLocation: vi.fn(),
}));
vi.mock("../components/LandingPreview.js", () => ({ LandingPreview: () => null }));
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function setup() {
  render(
    <MemoryRouter initialEntries={["/?new=1"]}>
      <Landing needsRoomReload={() => false} />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "Alex" } });
}
it("shows the default area and creates without asking for location permission", async () => {
  setup();
  expect(getLocation).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("Search area: New York City");
  expect(
    screen.getByRole("status").compareDocumentPosition(screen.getByRole("button", { name: "Create room" })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  await waitFor(() =>
    expect(createSession).toHaveBeenCalledWith(
      "Alex",
      expect.objectContaining({ locationLabel: "New York City" }),
      expect.any(AbortSignal),
    ),
  );
});
it("waits for an explicitly requested location before allowing creation", async () => {
  let resolve!: (position: { lat: number; lng: number }) => void;
  vi.mocked(getLocation).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  setup();
  fireEvent.click(screen.getByRole("button", { name: /Near me/ }));
  expect(getLocation).toHaveBeenCalledTimes(1);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Finding an area…" }).disabled).toBe(true);
  resolve({ lat: 42, lng: -71 });
  await waitFor(() =>
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create room" }).disabled).toBe(false),
  );
  expect(screen.getByRole("status").textContent).toContain("Search area: Current location");
  fireEvent.click(screen.getByRole("button", { name: "Create room" }));
  await waitFor(() =>
    expect(createSession).toHaveBeenCalledWith(
      "Alex",
      expect.objectContaining({ lat: 42, lng: -71 }),
      expect.any(AbortSignal),
    ),
  );
});
it("updates the area above Create room when a neighborhood is selected and hides it during an unfinished search", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Explore NYC" }));
  fireEvent.click(screen.getByRole("button", { name: "West Village" }));
  expect(screen.getByRole("status").textContent).toBe("Search area: West Village");
  fireEvent.click(screen.getByRole("button", { name: "Search by ZIP or town" }));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create room" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel location change" }));
  expect(screen.getByRole("status").textContent).toBe("Search area: West Village");
});
it("keeps the default available after denied permission and lets Near me retry", async () => {
  vi.mocked(getLocation).mockResolvedValueOnce(null).mockResolvedValueOnce({ lat: 42, lng: -71 });
  setup();
  const near = screen.getByRole("button", { name: /Near me/ });
  fireEvent.click(near);
  expect((await screen.findByRole("alert")).textContent).toContain("Your location is unavailable");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Create room" }).disabled).toBe(false);
  fireEvent.click(near);
  await waitFor(() => expect(near.getAttribute("aria-pressed")).toBe("true"));
  expect(screen.queryByRole("alert")).toBeNull();
});
