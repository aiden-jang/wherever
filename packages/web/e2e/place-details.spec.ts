import { test, expect, createRoom, audit } from "./fixtures.js";
import type { Page } from "@playwright/test";
import type { ServerMessage } from "@wherever/shared";

const name = "수진의아주긴레스토랑이름".repeat(8) + " 🥟";

async function routePhotos(page: Page) {
  for (const [shape, width, height] of [
    ["wide", 900, 300],
    ["tall", 300, 1200],
  ] as const) {
    await page.route(`**/test-photo-${shape}.svg`, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="tomato"/></svg>`,
      }),
    );
  }
  await page.route("**/test-photo-missing.svg", (route) => route.fulfill({ status: 404 }));
  return ["/test-photo-wide.svg", "/test-photo-tall.svg", "/test-photo-missing.svg"];
}
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
    const photoBefore = (await placeholder.locator("[data-card-photo]").boundingBox())!;
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

test("photo shape and fallback keep the vote controls still, with focus on the control only", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const photos = await routePhotos(page);
  await page.routeWebSocket("**/ws/**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === "deck" && message.restaurants[0]) {
        message.restaurants[0] = { ...message.restaurants[0], imageUrl: photos[0]!, photos };
      }
      socket.send(JSON.stringify(message));
    });
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  const frame = page.locator("[data-card-photo]").last();
  const vote = page.locator(".vote-no");
  const main = page.getByRole("main");
  await expect(frame).toBeVisible();
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
  await expect(main).toHaveCSS("outline-style", "none");
  await vote.focus();
  await expect(vote).toBeFocused();
  await expect(vote).toHaveCSS("outline-style", "solid");
  const image = frame.locator("img");
  const loadedHeight = () => image.evaluate((node: HTMLImageElement) => node.naturalHeight);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(loadedHeight).toBe(300);
    const before = await frame.boundingBox();
    const voteTop = (await vote.boundingBox())!.y;
    await frame.click();
    await expect.poll(loadedHeight).toBe(1200);
    expect((await frame.boundingBox())!.height).toBe(before!.height);
    expect((await vote.boundingBox())!.y).toBe(voteTop);
    await frame.click();
    await expect(image).toHaveCount(0);
    expect((await frame.boundingBox())!.height).toBe(before!.height);
    expect((await vote.boundingBox())!.y).toBe(voteTop);
    await frame.click();
  }
});

test("the winner has its gallery, hours and contact details on the result page", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const photos = (await routePhotos(page)).slice(0, 2);
  const hours = ["Monday: 8:00 AM - 10:00 PM", "Tuesday: 8:00 AM - 10:00 PM"];
  await page.routeWebSocket("**/ws/**", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === "match") {
        message.restaurant = {
          ...message.restaurant,
          name,
          photos,
          imageUrl: photos[0]!,
          hours,
          address: "123 Dinner Lane",
          editorialSummary: "A quiet spot for dinner.",
          wheelchairAccessible: true,
          website: "https://example.com/restaurant",
          phone: "+15555550100",
        };
      }
      socket.send(JSON.stringify(message));
    });
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  const result = page.getByRole("heading", { name: /Dinner is handled/ });
  const like = page.locator(".vote-yes");
  await expect(like).toBeVisible();
  for (let i = 0; i < 30 && (await like.isVisible()); i++) await like.click();
  await expect(result).toBeVisible();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^See details for/ })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("123 Dinner Lane", { exact: true })).toBeVisible();
  await expect(page.getByText("A quiet spot for dinner.", { exact: true })).toBeVisible();
  await expect(page.getByText("Wheelchair-accessible", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call the place" })).toHaveAttribute(
    "href",
    "tel:+15555550100",
  );
  await expect(page.getByRole("link", { name: /Website/ })).toHaveAttribute(
    "href",
    "https://example.com/restaurant",
  );
  await expect(page.getByRole("link", { name: "View on Google Maps" })).toBeVisible();
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(page.getByText("2 / 2", { exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const line of hours) await expect(page.getByText(line, { exact: true })).toBeVisible();
    await audit(page);
    await page.screenshot({
      path: test.info().outputPath(`inline-winner-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});
