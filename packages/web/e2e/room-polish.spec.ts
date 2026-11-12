import { createRoom, expect, test } from "./fixtures.js";

test("the invite keeps Back history and confirms the latest copy action", async ({ page }) => {
  await page.goto("/privacy.html");
  const previous = page.url();
  await page.goto("/");
  await page.getByRole("button", { name: "Join with a code" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  expect(page.url()).toBe(previous);

  await page.goto("/s/ABC");
  await expect(page.getByRole("heading", { name: "This code leads nowhere." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your name" })).toHaveCount(0);
  await page.goto("/share?url=&text=" + encodeURIComponent(new URL("/s/ABCDEF", page.url()).href));
  await expect(page.getByRole("heading", { name: "And you are?" })).toBeVisible();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  });
  const code = await createRoom(page);
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.getByText("Link copied.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Copy room code ${code}` }).click();
  await expect(page.getByText("Room code copied.", { exact: true })).toBeVisible();
});

test("an available update waits for the create dialog to close", async ({ page, baseURL }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Unsubmitted name");
  let checks = 0;
  await page.route(`${baseURL}/`, async (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    checks += 1;
    await route.fulfill({
      contentType: "text/html",
      body: '<script type="module" src="/assets/next-release.js"></script>',
    });
  });
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.getByText("An update is ready.")).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Unsubmitted name");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByText("An update is ready.")).toBeVisible();
});

test("switching from an NYC neighborhood to town search clears its highlight before creating the room", async ({
  page,
}) => {
  await page.route("**/api/geocode?*", (route) =>
    route.fulfill({ json: { lat: 39.7, lng: -104.9, label: "Denver, CO" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  const area = dialog.getByRole("status");
  await expect(area).toContainText("Search area: New York City");
  const areaBox = await area.boundingBox();
  const createBox = await dialog.getByRole("button", { name: "Create room" }).boundingBox();
  expect(areaBox!.y + areaBox!.height).toBeLessThanOrEqual(createBox!.y);
  await dialog.getByRole("button", { name: "Explore NYC" }).click();
  await dialog.getByRole("button", { name: "West Village", exact: true }).click();
  await expect(area).toHaveText("Search area: West Village");
  await dialog.getByRole("button", { name: "Search by ZIP or town" }).click();
  await expect(area).toHaveCount(0);
  await expect(dialog.getByText("West Village", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Create room" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "ZIP code or town" }).fill("Denver");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(area).toHaveText("Search area: Denver, CO");
  const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/sessions"));
  await dialog.getByRole("button", { name: "Create room" }).click();
  const sent = (await request).postDataJSON().filters;
  expect(sent.area).toBeUndefined();
  expect(sent.locationLabel).toBe("Denver, CO");
  await expect(page.getByRole("heading", { name: "Dinner room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore NYC" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change area" })).toBeVisible();
});
