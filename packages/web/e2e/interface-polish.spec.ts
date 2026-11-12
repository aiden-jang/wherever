import type { ServerMessage } from "@wherever/shared";
import { audit, createRoom, expect, test } from "./fixtures.js";

test("mobile setup keeps Start in reach and reflects customized presets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 680 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createRoom(page);
  const start = page.getByRole("button", { name: "Start swiping", exact: true });
  await expect(start).toBeInViewport();
  await page.getByRole("button", { name: /^quick/ }).click();
  const status = page.getByRole("status").filter({ hasText: /quick/ });
  await expect(status).toContainText("quick applied");
  await expect(status).toContainText("takeout");
  const distance = page.getByRole("radio", { name: "3 mi", exact: true });
  await distance.press("Space");
  await expect(distance).toBeChecked();
  await expect(status).toContainText("Customized");
  await expect(status).toContainText("3 mi");
  await expect(page.locator(".lobby-start-summary")).toContainText("3 mi");
  await expect(start).toBeInViewport();
  await page.getByRole("button", { name: "Change area", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expect(start).toBeDisabled();
  await expect(page.locator(".lobby-start-summary")).toContainText("Finish choosing an area");
  await page.getByRole("button", { name: "Cancel location change" }).click();
  await expect(start).toBeEnabled();
  await page.getByText("At the table", { exact: true }).first().scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport();
  await audit(page);
  await page.screenshot({ path: test.info().outputPath("mobile-setup.png"), fullPage: true });
});

test("photo controls are explicit and undo keeps the vote controls steady", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.routeWebSocket("**/ws/*", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage;
      if (message.type === "deck") {
        message.restaurants = message.restaurants.map((restaurant) => ({
          ...restaurant,
          imageUrl: "/teaser-pizza.jpg",
          photos: ["/teaser-pizza.jpg", "/teaser-ramen.jpg"],
        }));
      }
      socket.send(JSON.stringify(message));
    });
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  const yes = page.getByRole("button", { name: "Yes, please", exact: true });
  const veto = page.getByRole("button", { name: "Veto (one per round, kills it outright)" });
  const first = await veto.boundingBox();
  await page.getByRole("button", { name: "Next photo, 1 of 2" }).click();
  await page.getByRole("button", { name: "Previous photo, 2 of 2" }).click();
  await expect(page.getByRole("button", { name: "Next photo, 1 of 2" })).toBeVisible();
  await expect(page.getByText(/Place 1 of/)).toBeVisible();
  const details = page.getByRole("button", { name: /^See details for/ });
  await expect(details).toHaveText("Details");
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeFocused();
  await yes.click();
  expect((await veto.boundingBox())!.y).toBeCloseTo(first!.y, 0);
  await page.getByRole("button", { name: "Undo last vote" }).click();
  expect((await veto.boundingBox())!.y).toBeCloseTo(first!.y, 0);
  await expect(page.getByRole("button", { name: "Undo last vote" })).toHaveCount(0);
  await audit(page);
});
