import { mkdir } from "node:fs/promises";
import { test, expect, createRoom } from "./fixtures.js";

test("the dinner image reaches native sharing from the click and cancellation does not download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let attempt = 0;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        if (!data.files) return;
        if (!navigator.userActivation.isActive) throw new Error("share lost its gesture");
        if (attempt++ === 0) throw new DOMException("closed", "AbortError");
        (window as unknown as { sharedImage: { name: string; type: string; size: number } }).sharedImage = {
          name: data.files[0]!.name,
          type: data.files[0]!.type,
          size: data.files[0]!.size,
        };
      },
    });
  });
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  for (let i = 0; i < 30; i++) {
    if (await page.getByRole("heading", { name: /Dinner is handled/ }).isVisible()) break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
  }
  const share = page.getByRole("button", { name: "Share plan image", exact: true });
  await expect(share).toBeVisible();
  if (process.env.CAPTURE_DETAILS && test.info().project.name === "chromium") {
    const folder = new URL("../../../docs/ui-review/finishing-details/", import.meta.url).pathname;
    await mkdir(folder, { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 900],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await share.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${folder}sharing-${name}.png`,
        fullPage: false,
        animations: "disabled",
      });
    }
  }
  const downloads: unknown[] = [];
  page.on("download", (download) => downloads.push(download));
  await share.click();
  await expect(share).toBeEnabled();
  await expect(page.getByText(/Couldn’t share the image/)).toHaveCount(0);
  expect(downloads).toHaveLength(0);
  await share.click();
  await expect(page.getByText("Image handed to the share sheet.")).toBeVisible();
  const file = await page.evaluate(
    () => (window as unknown as { sharedImage: { name: string; type: string; size: number } }).sharedImage,
  );
  expect(file.name).toMatch(/^wherever-.+-\d{4}-\d{2}-\d{2}\.png$/);
  expect(file.type).toBe("image/png");
  expect(file.size).toBeGreaterThan(1000);
});
