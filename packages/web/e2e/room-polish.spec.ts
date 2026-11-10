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
