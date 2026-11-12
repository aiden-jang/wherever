import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BallotChoice, Restaurant } from "@wherever/shared";
import { SwipeDeck } from "./SwipeDeck.js";

vi.mock("./sound.js", () => ({ play: vi.fn() }));
vi.mock("./haptics.js", () => ({ buzz: vi.fn() }));
const restaurants = ["Pizza", "Ramen", "Tacos", "Burgers"].map((name) => ({
  id: name,
  name,
  category: "pizza",
  priceTier: 2,
  rating: 4.5,
  reviewCount: 10,
  distanceMeters: 100,
  imageUrl: null,
  address: null,
})) as Restaurant[];
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  localStorage.setItem("wherever:swipe-hint-seen", "1");
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(undoAllowed?: boolean) {
  const swipe = vi.fn<(choice: BallotChoice) => boolean>().mockReturnValue(true),
    undo = vi.fn<(choice: BallotChoice) => boolean>().mockReturnValue(true);
  render(
    <main id="main-content" tabIndex={-1}>
      <SwipeDeck
        restaurants={restaurants}
        onLoadPlace={() => {}}
        onSwipe={swipe}
        onUndo={undo}
        {...(undoAllowed === undefined
          ? {}
          : {
              undoAllowed,
              ballot: [
                { restaurantId: "Pizza", direction: "left" as const },
                { restaurantId: "Ramen", direction: "right" as const },
              ],
            })}
      />
    </main>,
  );
  return { swipe, undo };
}
it("allows one step back, then requires another vote before Undo is available again", () => {
  const { swipe, undo } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Nope" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  const undoButton = screen.getByRole("button", { name: "Undo last vote" });
  undoButton.focus();
  fireEvent.click(undoButton);
  expect(undo).toHaveBeenCalledTimes(1);
  expect(undo.mock.calls[0]![0]).toMatchObject({ restaurantId: "Ramen" });
  expect(document.activeElement).toBe(screen.getByRole("main"));
  expect(screen.queryByRole("button", { name: "Undo last vote" })).toBeNull();
  fireEvent.keyDown(document.activeElement!, { key: "Backspace" });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Place 2 of 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Yes, please" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo last vote" }));
  expect(undo).toHaveBeenCalledTimes(2);
  expect(swipe).toHaveBeenCalledTimes(3);
});
it("restores the server's consumed Undo without re-enabling older votes", () => {
  setup(false);
  expect(screen.getByText("Place 3 of 4")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Undo last vote" })).toBeNull();
});
it("moves keyboard focus from a clicked Nope to Yes, and leaves the down arrow for scrolling", () => {
  const { swipe } = setup();
  const nope = screen.getByRole("button", { name: "Nope" });
  nope.focus();
  fireEvent.click(nope);
  fireEvent.keyDown(nope, { key: "ArrowRight" });
  const yes = screen.getByRole("button", { name: "Yes, please" });
  expect(document.activeElement).toBe(yes);
  expect(swipe.mock.calls[1]![0]).toMatchObject({ direction: "right", restaurantId: "Ramen" });
  fireEvent.keyDown(yes, { key: "ArrowDown" });
  expect(swipe).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(yes, { key: "v" });
  expect(swipe.mock.calls[2]![0]).toMatchObject({ direction: "left", veto: true });
  expect(document.activeElement?.getAttribute("data-vote-action")).toBe("veto");
});
it("keeps compact cards clear of names and opens the selected photo with its credit", () => {
  const restaurant = {
    ...restaurants[0]!,
    imageUrl: "/a.jpg",
    photos: ["/a.jpg", "/b.jpg"],
    photoCredits: {
      "/a.jpg": [{ name: "First author" }],
      "/b.jpg": [{ name: "Second author", url: "https://maps.google.com/user" }],
    },
    photoMapsUris: { "/b.jpg": "https://maps.google.com/photo/b" },
  };
  render(
    <main id="main-content">
      <SwipeDeck restaurants={[restaurant]} onLoadPlace={() => {}} onSwipe={() => true} onUndo={() => true} />
    </main>,
  );
  expect(screen.queryByText("First author")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next photo, 1 of 2" }));
  expect(screen.queryByText("Second author")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "See details for Pizza" }));
  const dialog = screen.getByRole("dialog", { name: "Pizza details" });
  expect(within(dialog).getByRole("link", { name: "Second author" })).toBeTruthy();
  expect(within(dialog).queryByText("First author")).toBeNull();
  expect(within(dialog).getByRole("link", { name: "View photo on Google Maps" }).getAttribute("href")).toBe(
    "https://maps.google.com/photo/b",
  );
});
