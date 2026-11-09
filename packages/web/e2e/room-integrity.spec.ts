import { test, expect, createRoom } from "./fixtures.js";

test("creation waits for the browser position", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (success: (position: { coords: { latitude: number; longitude: number } }) => void) => {
        window.addEventListener(
          "fixture-location",
          () => success({ coords: { latitude: 42, longitude: -71 } }),
          {
            once: true,
          },
        );
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  await expect(dialog.getByRole("button", { name: "Finding your location…" })).toBeDisabled();
  const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/sessions"));
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-location")));
  await dialog.getByRole("button", { name: "Create room" }).click();
  expect((await request).postDataJSON()).toMatchObject({ filters: { lat: 42, lng: -71 } });
});

test("a host can undo the last vote while the group is still voting", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const code = await createRoom(page);
  const guest = await browser.newContext({ baseURL: new URL(page.url()).origin, serviceWorkers: "block" });
  try {
    const friend = await guest.newPage();
    await friend.goto(`/s/${code}`);
    await friend.getByRole("textbox", { name: "Your name" }).fill("Guest");
    await friend.getByRole("button", { name: "Join the session" }).click();
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start swiping" }).click();
    const first = await page.getByText(/Place 1 of \d+/).textContent();
    const count = Number(first?.split(" ").at(-1));
    const like = page.getByRole("button", { name: "Yes, please", exact: true });
    for (let i = 0; i < count; i += 1) await like.click();
    await expect(page.getByRole("heading", { name: "Waiting for the group" })).toBeVisible();
    await page.getByRole("button", { name: "Undo last vote" }).click();
    await expect(page.getByText(`Place ${count} of ${count}`)).toBeVisible();
  } finally {
    await guest.close();
  }
});
