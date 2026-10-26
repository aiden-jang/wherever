import { test, expect } from "./fixtures.js";

test.use({ serviceWorkers: "allow" });

test("the installed shell stays public and reopens offline", async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== "chromium", "Playwright service-worker control is established in Chromium.");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
      );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.goto("/s/ABCDEF");
  await expect(page.getByRole("heading", { name: "And you are?" })).toBeVisible();
  expect(await page.evaluate(async () => (await caches.match("/"))?.url)).toBe(`${baseURL}/`);
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a session", exact: true })).toBeEnabled();
});
