import { test, expect, createRoom } from "./fixtures.js";

test("an expired open room clears its controls and offers a new plan", async ({ page }) => {
  let expire!: () => void;
  await page.routeWebSocket("**/ws/*", (socket) => {
    socket.connectToServer();
    expire = () => socket.close({ code: 1008, reason: "This room has expired. Start a new plan." });
  });
  await createRoom(page, "Synthetic owner");
  await expect(page.getByRole("button", { name: "Start swiping", exact: true })).toBeVisible();
  expire();
  await expect(page.getByRole("heading", { name: "This code leads nowhere." })).toBeVisible();
  await expect(page.getByText("This room has expired. Start a new plan.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start swiping", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start a fresh session" })).toBeVisible();
});

test("an unavailable location search keeps the query and can be retried", async ({ page }) => {
  let available = false;
  await page.route("**/api/geocode?*", (route) =>
    available
      ? route.fulfill({ json: { lat: 39.7, lng: -104.9, label: "Denver, CO" } })
      : route.fulfill({ status: 503, json: { error: "Location search is unavailable. Try again shortly." } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  const field = dialog.getByRole("textbox", { name: "Zip or town" });
  await field.fill("Denver");
  await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Location search is unavailable");
  await expect(field).toHaveValue("Denver");
  await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Alex");
  available = true;
  await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog.getByText("Denver, CO", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("changing a location preserves the selected town until a replacement is chosen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const selected: unknown[] = [];
  await page.route("**/api/geocode?*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    return query === "Missing"
      ? route.fulfill({ json: null })
      : route.fulfill({ json: { lat: 39.7, lng: -104.9, label: `${query}, CO` } });
  });
  await page.route("**/api/sessions", async (route) => {
    selected.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, json: { error: "Test creation stopped." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  await dialog.getByRole("textbox", { name: "Zip or town" }).fill("Denver");
  await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog.getByText("Denver, CO", { exact: true })).toBeVisible();
  const change = dialog.getByRole("button", { name: "Change", exact: true });
  await change.click();
  const search = dialog.getByRole("textbox", { name: "Zip or town" });
  await expect(search).toBeFocused();
  await search.fill("Boulder");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`location-edit-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Cancel location change" }).click();
  await expect(change).toBeFocused();
  await expect(dialog.getByText("Denver, CO", { exact: true })).toBeVisible();
  await change.click();
  await search.fill("Boulder");
  await dialog.getByRole("button", { name: "Go", exact: true }).click();
  await expect(dialog.getByText("Boulder, CO", { exact: true })).toBeVisible();
  await expect(change).toBeFocused();
  expect(selected).toEqual([]);
});
