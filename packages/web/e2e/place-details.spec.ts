import { test, expect, createRoom } from "./fixtures.js";
import type { ServerMessage } from "@wherever/shared";

const name = "수진의아주긴레스토랑이름".repeat(8) + " 🥟";
test("long place details and missing photos stay readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/missing-review-photo.jpg", (route) => route.fulfill({ status: 404 }));
  await page.routeWebSocket("**/ws/**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === "deck") {
        message.restaurants = message.restaurants.map((place) => ({
          ...place,
          name,
          address: "AnUnbrokenAddress".repeat(15),
          imageUrl: "/missing-review-photo.jpg",
          photos: ["/missing-review-photo.jpg"],
        }));
      }
      socket.send(JSON.stringify(message));
    });
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  await page.getByRole("button", { name: `See details for ${name}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `${name} details`, exact: true });
  await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await expect(dialog.locator(".restaurant-gallery img")).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Open in Google Maps ↗", exact: true })).toHaveAttribute(
      "href",
      /maps/,
    );
    await page.screenshot({
      path: test.info().outputPath(`place-details-${width}.png`),
      animations: "disabled",
    });
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: `See details for ${name}`, exact: true })).toBeFocused();
});

for (const width of [1440, 390]) {
  test(`dealing preserves the card and photo dimensions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let release: (() => void) | undefined;
    await page.routeWebSocket("**/ws/**", (socket) => {
      const server = socket.connectToServer();
      server.onMessage((data) => {
        const message = JSON.parse(String(data)) as ServerMessage;
        if (message.type === "deck") release = () => socket.send(data);
        else socket.send(data);
      });
    });
    await createRoom(page);
    await page.getByRole("button", { name: "Start swiping", exact: true }).click();
    await expect.poll(() => !!release).toBe(true);
    const placeholder = page.locator(".meal-card").last();
    await expect(placeholder).toBeVisible();
    const cardBefore = (await placeholder.boundingBox())!;
    const photoBefore = (await placeholder.locator(":scope > div").first().boundingBox())!;
    await page.screenshot({ path: test.info().outputPath(`dealing-${width}.png`), animations: "disabled" });
    release!();
    await expect(page.getByRole("button", { name: /^See details for / })).toBeVisible();
    const cardAfter = (await page.locator(".meal-card").last().boundingBox())!;
    const photoAfter = (await page.locator("[data-card-photo]").last().boundingBox())!;
    expect(Math.abs(cardBefore.width - cardAfter.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(cardBefore.height - cardAfter.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(photoBefore.height - photoAfter.height)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`dealt-${width}.png`), animations: "disabled" });
  });
}
