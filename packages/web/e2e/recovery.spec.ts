import { test, expect, createRoom, audit } from "./fixtures.js";

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
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
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
  const field = dialog.getByRole("textbox", { name: "ZIP code or town" });
  await field.fill("Denver");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Location search is unavailable");
  await expect(dialog.getByRole("button", { name: "Create room" })).toBeDisabled();
  await expect(field).toHaveValue("Denver");
  await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Alex");
  available = true;
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.locator(".location-picker").getByText("Denver, CO", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("a typed town cannot be skipped when creating a room or starting a round", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
        success({ coords: { latitude: 39.7392, longitude: -104.9903 } }),
    });
  });
  await page.route("**/api/geocode?*", (route) =>
    route.fulfill({ json: { lat: 37.7749, lng: -122.4194, label: "San Francisco, CA" } }),
  );
  await page.setViewportSize({ width: 320, height: 680 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  const create = dialog.getByRole("button", { name: "Create room" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  await expect(create).toBeEnabled();
  await dialog.getByRole("textbox", { name: "ZIP code or town" }).fill("San Francisco");
  await expect(create).toBeDisabled();
  await audit(page);
  await page.screenshot({ path: test.info().outputPath("confirm-town.png") });
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    dialog.locator(".location-picker").getByText("San Francisco, CA", { exact: true }),
  ).toBeVisible();
  const request = page.waitForRequest((candidate) => candidate.url().endsWith("/api/sessions"));
  await create.click();
  expect((await request).postDataJSON()).toMatchObject({
    filters: { lat: 37.7749, lng: -122.4194, locationLabel: "San Francisco, CA" },
  });
  await expect(page.locator(".lobby-search").getByText(/^San Francisco, CA ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Done editing" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Change area", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  const town = page.getByRole("textbox", { name: "ZIP code or town" });
  await town.fill("Boulder");
  await page.getByRole("button", { name: "Explore NYC" }).click();
  await expect(town).toBeHidden();
  await expect(page.getByText("Choose a new area", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start swiping" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Done editing" })).toBeDisabled();
  await page.getByRole("button", { name: "Back to ZIP or town" }).click();
  await expect(town).toHaveValue("Boulder");
  await page.getByRole("button", { name: "Cancel location change" }).click();
  await expect(page.getByRole("button", { name: "Start swiping" })).toBeEnabled();
  await expect(page.locator(".lobby-search").getByText(/^San Francisco, CA ·/)).toBeVisible();
});

test("a guest can correct a mistyped invite code and join the original room", async ({ page, context }) => {
  const code = await createRoom(page);
  const wrongCode = code.startsWith("A") ? `B${code.slice(1)}` : `A${code.slice(1)}`;
  const guest = await context.newPage();
  await guest.goto("/");
  await guest.getByRole("button", { name: "Join with a code" }).click();
  const name = guest.getByRole("textbox", { name: "Your name" });
  const codeField = guest.getByRole("textbox", { name: "Session code" });
  await name.fill("Sam");
  await codeField.fill(wrongCode);
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await expect(guest.getByRole("heading", { name: "This code leads nowhere." })).toBeVisible();
  await guest.getByRole("link", { name: "Edit code" }).click();
  await expect(codeField).toHaveValue(wrongCode);
  await expect(codeField).toBeFocused();
  await guest.reload();
  await expect(codeField).toHaveValue(wrongCode);
  await expect(name).toHaveValue("Sam");
  await codeField.fill(code);
  await codeField.press("Enter");
  await expect(guest.getByRole("heading", { name: "Dinner room" })).toBeVisible();
  await expect(page.getByText("2 people", { exact: true })).toBeVisible();
});

test("Explore NYC lets a host outside New York deliberately pick a neighborhood", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (success: (position: { coords: { latitude: number; longitude: number } }) => void) =>
        success({ coords: { latitude: 39.7392, longitude: -104.9903 } }),
    });
  });
  await page.setViewportSize({ width: 320, height: 680 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session" }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
  const nearMe = dialog.getByRole("button", { name: /Near me/ });
  await expect(nearMe).toHaveAttribute("aria-pressed", "false");
  await nearMe.click();
  await expect(nearMe).toHaveAttribute("aria-pressed", "true");
  const explore = dialog.getByRole("button", { name: "Explore NYC" });
  const back = dialog.getByRole("button", { name: "Back to ZIP or town" });
  const town = dialog.getByRole("textbox", { name: "ZIP code or town" });
  const create = dialog.getByRole("button", { name: "Create room" });
  const neighborhood = dialog.getByRole("button", { name: "Williamsburg", exact: true });
  await expect(explore).toHaveAttribute("aria-expanded", "false");
  await expect(neighborhood).toBeHidden();
  await town.fill("Denver");
  await explore.click();
  await expect(town).toBeHidden();
  await expect(create).toBeDisabled();
  await expect(back).toHaveAttribute("aria-expanded", "true");
  await back.press("Enter");
  await expect(explore).toBeFocused();
  await expect(town).toHaveValue("Denver");
  await explore.click();
  await expect(nearMe).toHaveAttribute("aria-pressed", "false");
  await expect(create).toBeDisabled();
  await audit(page);
  await page.screenshot({ path: test.info().outputPath("explore-nyc.png") });
  await neighborhood.click();
  await expect(nearMe).toHaveAttribute("aria-pressed", "false");
  await expect(neighborhood).toBeHidden();
  await expect(town).toBeHidden();
  const selectedArea = dialog.getByRole("button", { name: "NYC neighborhoods Williamsburg" });
  await expect(selectedArea).toHaveAttribute("aria-expanded", "false");
  await expect(selectedArea).toBeFocused();
  await selectedArea.press("Enter");
  await expect(neighborhood).toHaveAttribute("aria-pressed", "true");
  await expect(town).toBeHidden();
  await selectedArea.press("Enter");
  await expect(neighborhood).toBeHidden();
  await audit(page);
  await page.screenshot({ path: test.info().outputPath("selected-neighborhood.png") });

  const searchByTown = dialog.getByRole("button", { name: "Search by ZIP or town" });
  await searchByTown.click();
  await expect(town).toBeFocused();
  await town.fill("Denver");
  await expect(create).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel location change" }).click();
  await expect(searchByTown).toBeFocused();
  await expect(town).toBeHidden();
  await expect(selectedArea).toHaveAttribute("aria-expanded", "false");
  await create.click();
  await expect(page.locator(".lobby-search").getByText(/^Williamsburg ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Done editing" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("textbox", { name: "ZIP code or town" })).toBeHidden();
  const lobbyArea = page.getByRole("button", { name: "NYC neighborhoods Williamsburg" });
  await expect(lobbyArea).toHaveCount(0);
  await page.getByRole("button", { name: "Change area", exact: true }).click();
  await expect(lobbyArea).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Williamsburg", exact: true })).toBeHidden();
  await lobbyArea.click();
  const chosen = page.getByRole("button", { name: "Williamsburg", exact: true });
  await expect(chosen).toHaveAttribute("aria-pressed", "true");
  await chosen.click();
  await expect(lobbyArea).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change area", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "ZIP code or town" })).toBeHidden();
  await expect(page.locator(".lobby-search").getByText(/^Williamsburg ·/)).toBeVisible();
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
  await dialog.getByRole("textbox", { name: "ZIP code or town" }).fill("Denver");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.locator(".location-picker").getByText("Denver, CO", { exact: true })).toBeVisible();
  const change = dialog.getByRole("button", { name: "Change", exact: true });
  await change.click();
  const search = dialog.getByRole("textbox", { name: "ZIP code or town" });
  await expect(search).toBeFocused();
  await search.fill("Boulder");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`location-edit-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Cancel location change" }).click();
  await expect(change).toBeFocused();
  await expect(dialog.locator(".location-picker").getByText("Denver, CO", { exact: true })).toBeVisible();
  await change.click();
  await search.fill("Boulder");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.locator(".location-picker").getByText("Boulder, CO", { exact: true })).toBeVisible();
  await expect(change).toBeFocused();
  expect(selected).toEqual([]);
});
