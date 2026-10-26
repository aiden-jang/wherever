import { test, expect } from "./fixtures.js";

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
