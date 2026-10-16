import { test, expect, createRoom } from "./fixtures.js";

test("selecting text, focusing controls and cancelled presses do not vote", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  const detail = page.getByRole("button", { name: /^See details for / });
  await expect(detail).toBeVisible();
  const original = await detail.getAttribute("aria-label");
  await page
    .locator(".meal-name")
    .last()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
  await page.keyboard.press("ArrowRight");
  await expect(detail).toHaveAttribute("aria-label", original!);
  await page.evaluate(() => getSelection()!.removeAllRanges());
  await page.getByRole("button", { name: /Turn sound / }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(detail).toHaveAttribute("aria-label", original!);
  await page.evaluate(() => {
    getSelection()!.removeAllRanges();
    (document.activeElement as HTMLElement)?.blur();
  });
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await expect(detail).toHaveAttribute("aria-label", original!);
  await page.keyboard.press("ArrowRight");
  await expect(detail).not.toHaveAttribute("aria-label", original!);
  // Touch scrolling sends pointercancel. A later release must not open the card.
  const active = page.locator('[aria-roledescription="restaurant card"]');
  await active.dispatchEvent("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
    button: 0,
    clientX: 80,
    clientY: 100,
  });
  await active.dispatchEvent("pointercancel", { pointerId: 2, pointerType: "touch" });
  await active.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch", clientX: 80, clientY: 100 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const [width, height] of [
    [1440, 900],
    [390, 780],
    [844, 390],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await detail.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    await expect(
      dialog.getByRole("link", { name: "Open in Google Maps ↗", exact: true }),
    ).toHaveAccessibleDescription("Opens in a new tab");
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`gesture-details-${width}.png`),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});
