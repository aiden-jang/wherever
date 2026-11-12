import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, type Restaurant } from "@wherever/shared";
import { WinnerScreen } from "./WinnerScreen.js";
import { FilterFields } from "./FilterFields.js";
import { play } from "./sound.js";

vi.mock("./sound.js", () => ({ play: vi.fn() }));
vi.mock("./haptics.js", () => ({ buzz: vi.fn() }));
const restaurant: Restaurant = {
  id: "winner",
  name: "Dinner Spot",
  category: "pizza",
  rating: 4.5,
  priceTier: 2,
  reviewCount: 200,
  distanceMeters: 1000,
  imageUrl: "/a.jpg",
  photos: ["/a.jpg", "/b.jpg"],
  photoCredits: {
    "/a.jpg": [{ name: "First author" }],
    "/b.jpg": [{ name: "Second author", url: "https://maps.google.com/author" }],
  },
  photoMapsUris: { "/b.jpg": "https://maps.google.com/photo/b" },
  address: "123 Dinner Lane",
  hours: ["Monday: 8 AM - 10 PM"],
  editorialSummary: "A quiet spot for dinner.",
  phone: "+15555550100",
  openNow: true,
};
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
  vi.clearAllMocks();
});
function setup(place = restaurant) {
  const onAgain = vi.fn(),
    onEditSearch = vi.fn(),
    onChooseAlternative = vi.fn();
  render(
    <MemoryRouter>
      <WinnerScreen
        match={{
          kind: "match",
          restaurant: place,
          rightSwipes: 1,
          totalParticipants: 1,
          vetoedCount: 0,
          tiedWith: 0,
          vetoedTop: false,
          superTipped: false,
          round: 1,
          alternatives: [
            { restaurant: { ...restaurant, id: "backup", name: "Backup Spot" }, rightSwipes: 1 },
          ],
        }}
        visited={[]}
        filters={DEFAULT_FILTERS}
        isHost
        online
        pending={false}
        demo={false}
        onAgain={onAgain}
        onEditSearch={onEditSearch}
        onChooseAlternative={onChooseAlternative}
        onNeverAgain={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { onAgain, onEditSearch, onChooseAlternative };
}
it("keeps the winner free of credits and opens the selected photo in a credited viewer", () => {
  setup();
  expect(screen.queryByText("First author")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
  expect(screen.queryByText("Second author")).toBeNull();
  const trigger = screen.getByRole("button", { name: /View photos/ });
  trigger.focus();
  fireEvent.click(trigger);
  const viewer = screen.getByRole("dialog", { name: "Dinner Spot photos" });
  expect(within(viewer).getByRole("link", { name: "Second author" })).toBeTruthy();
  expect(within(viewer).getByRole("link", { name: "View photo on Google Maps" }).getAttribute("href")).toBe(
    "https://maps.google.com/photo/b",
  );
  fireEvent.click(within(viewer).getByRole("button", { name: "Close" }));
  expect(document.activeElement).toBe(trigger);
});
it("folds secondary information and keeps round actions available", () => {
  const { onAgain, onEditSearch } = setup();
  const details = screen.getByText("Hours & place details").closest("details")!;
  expect(details.open).toBe(false);
  expect(screen.getByText("Decision receipt").closest("details")!.open).toBe(false);
  expect(screen.getByText("Plan image options").closest("details")!.open).toBe(false);
  expect(screen.getByRole("button", { name: "Save plan image" }).closest("details")).toBe(
    screen.getByText("Plan image options").closest("details"),
  );
  expect(screen.getByRole("button", { name: "Send the plan" })).toBeTruthy();
  fireEvent.click(screen.getByText("Plan image options"));
  expect(screen.getByRole("button", { name: "Save plan image" })).toBeTruthy();
  fireEvent.click(screen.getByText("Hours & place details"));
  expect(details.open).toBe(true);
  expect(screen.getByRole("link", { name: "Call the place" }).getAttribute("href")).toBe("tel:+15555550100");
  fireEvent.click(screen.getByRole("button", { name: "Vote on new places" }));
  expect(onAgain).toHaveBeenCalledWith("new");
  fireEvent.click(screen.getByRole("button", { name: "Edit search" }));
  expect(onEditSearch).toHaveBeenCalled();
});
it("offers open backups without celebrating a closed winner", () => {
  const { onChooseAlternative } = setup({ ...restaurant, openNow: false });
  expect(screen.getByRole("heading", { name: /One catch: the hours/ })).toBeTruthy();
  expect(play).not.toHaveBeenCalledWith("match");
  expect(screen.getByText("The doors are shut. Try a backup.").closest("details")!.open).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Make Plan A: Backup Spot" }));
  expect(onChooseAlternative).toHaveBeenCalledWith("backup");
});
it("shows exact selected distance and rating values supplied by group presets", () => {
  render(
    <FilterFields
      filters={{ ...DEFAULT_FILTERS, radiusMeters: 800, minRating: 4.4 }}
      onChange={vi.fn()}
      showLocation={false}
    />,
  );
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "0.5 mi" }).checked).toBe(true);
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "4.4+" }).checked).toBe(true);
});

it("shows a chaotic preset's shuffle and lets the host explicitly change its order", () => {
  const onChange = vi.fn();
  render(
    <FilterFields filters={{ ...DEFAULT_FILTERS, shuffle: true }} onChange={onChange} showLocation={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^More filters/ }));
  expect(screen.getByRole<HTMLInputElement>("radio", { name: /^Shuffle$/ }).checked).toBe(true);
  fireEvent.click(screen.getByRole("radio", { name: /^Closest$/ }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shuffle: false, sort: "distance" }));
});
