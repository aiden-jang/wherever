import { test as base, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
export const test = base.extend({
  extraHTTPHeaders: async ({ browserName }, use, info) => {
    let id = 0;
    for (const char of `${browserName}:${info.title}`) id = (id * 31 + char.charCodeAt(0)) >>> 0;
    await use({ "CF-Connecting-IP": `198.18.${id % 254}.${((id >>> 8) % 254) + 1}` });
  },
});
export { expect };

export async function audit(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  // Run the test helper through automation while page scripts remain subject to the app CSP.
  await page.evaluate(await readFile(require.resolve("axe-core/axe.min.js"), "utf8"));
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }
    ).axe;
    return (await axe.run({ runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }))
      .violations;
  });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

export async function createRoom(page: Page, name = "Alex") {
  await page.goto("/");
  await page.getByRole("button", { name: "Start a session", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Start a session" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill(name);
  await dialog.getByRole("button", { name: "Deal the cards" }).click();
  await expect(page.getByRole("heading", { name: /Waiting to start/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start swiping", exact: true })).toBeEnabled();
  return page.url().split("/s/")[1]!;
}
