import type { ClientMessage, Restaurant, ServerMessage } from "@wherever/shared";
import type { Page, WebSocketRoute } from "@playwright/test";
import { audit, createRoom, expect, test } from "./fixtures.js";

const code = "ABCDEF";
const place: Restaurant = {
  id: "place-a",
  source: "google",
  name: "Restaurant details unavailable",
  category: "Pizza",
  priceTier: 2,
  distanceMeters: 0,
  rating: null,
  reviewCount: null,
  address: null,
  imageUrl: null,
  googleMapsUri: "https://www.google.com/maps/search/?api=1&query=restaurant&query_place_id=place-a",
};

async function openFixture(
  page: Page,
  status: "swiping" | "decided",
  result: ServerMessage,
  onMessage?: (socket: WebSocketRoute, message: ClientMessage) => void,
) {
  await page.addInitScript(() => sessionStorage.setItem("displayName", "Audit Guest"));
  await page.routeWebSocket("**/ws/**", (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as ClientMessage;
      if (message.type !== "join") return onMessage?.(socket, message);
      socket.send(JSON.stringify({ type: "identity", participantId: "guest" }));
      socket.send(
        JSON.stringify({
          type: "session_state",
          session: {
            id: code,
            code,
            status,
            voteMode: "majority",
            filters: { radiusMeters: 1600, maxPriceTier: 4, categories: [] },
            participants: [{ id: "guest", displayName: "Audit Guest", connected: true, isHost: false }],
          },
        }),
      );
      socket.send(JSON.stringify(result));
    });
  });
  await page.goto(`/s/${code}`);
}

test("a winner without an address uses its saved Maps listing", async ({ page }) => {
  await openFixture(page, "decided", {
    type: "match",
    restaurant: place,
    rightSwipes: 1,
    totalParticipants: 1,
  });
  await expect(page.getByRole("link", { name: "See it in Google Maps" })).toHaveAttribute(
    "href",
    place.googleMapsUri!,
  );
  await expect(page.getByRole("button", { name: "Get directions" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send the plan" })).toBeVisible();
});

test("sample place details explain the fixture and offer no outside actions", async ({ page }) => {
  await openFixture(page, "swiping", {
    type: "deck",
    demo: "sample",
    restaurants: [{ ...place, source: undefined, name: "Sample Pizza", address: "123 Imaginary Lane" }],
  });
  await page.getByRole("button", { name: "See details for Sample Pizza" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Sample restaurant. This place is fictional.")).toBeVisible();
  await expect(dialog.getByRole("link")).toHaveCount(0);
});

test("a resumed deck requests only the visible card and waits before enabling votes", async ({ page }) => {
  const pending = { ...place, id: "place-b", detailsStatus: "pending" as const };
  const later = { ...pending, id: "place-c" };
  const requests: string[] = [];
  let showPlace: ((restaurant: Restaurant, roundId: number) => void) | undefined;
  await openFixture(
    page,
    "swiping",
    {
      type: "deck",
      roundId: 4,
      restaurants: [place, pending, later],
      alreadyVoted: [place.id],
    },
    (socket, message) => {
      if (message.type !== "load_round_place") return;
      requests.push(message.restaurantId);
      showPlace = (restaurant, roundId) =>
        socket.send(JSON.stringify({ type: "round_place", roundId, restaurant }));
    },
  );
  await expect.poll(() => requests).toEqual([pending.id]);
  const like = page.getByRole("button", { name: "Yes, please" });
  await expect(like).toBeDisabled();
  const restored = { ...pending, detailsStatus: undefined, name: "Pizza Nearby" };
  showPlace!(restored, 3);
  await expect(page.getByText("Loading restaurant details…")).toBeVisible();
  showPlace!(restored, 4);
  await expect(page.getByRole("button", { name: "See details for Pizza Nearby" })).toBeVisible();
  await like.click();
  await expect.poll(() => requests).toEqual([pending.id, later.id]);
  showPlace!({ ...later, detailsStatus: "unavailable" }, 4);
  await expect(page.getByRole("button", { name: "Skip this place" })).toBeEnabled();
  await expect(like).toBeDisabled();
  await expect(page.getByRole("button", { name: "Undo last vote" })).toBeEnabled();
});

test("the selected group preference stays readable", async ({ page }) => {
  await createRoom(page);
  await expect(page.locator(".lobby-preferences")).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Done editing" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /^quick/ }).click();
  await expect(page.getByText("The deck prioritizes quick places within your dinner filters.")).toBeVisible();
  await audit(page);
});

test("a touch invite waits for the person to focus their name", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 640 },
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(`/s/${code}`);
    const name = page.getByRole("textbox", { name: "Your name" });
    await expect(name).toBeVisible();
    await expect(name).not.toBeFocused();
  } finally {
    await context.close();
  }
});
