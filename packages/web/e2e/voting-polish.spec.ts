import { test, expect, createRoom, audit } from "./fixtures.js";

test("one step of Undo survives reconnect and keyboard votes focus the matching button", async ({
  page,
  browser,
}) => {
  const code = await createRoom(page);
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, serviceWorkers: "block" });
  try {
    const guest = await context.newPage();
    await guest.goto(`/s/${code}`);
    await guest.getByRole("textbox", { name: "Your name" }).fill("Guest");
    await guest.getByRole("button", { name: "Join the session" }).click();
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start swiping", exact: true }).click();
    const nope = page.getByRole("button", { name: "Nope", exact: true });
    await nope.click();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Yes, please", exact: true })).toBeFocused();
    await expect(nope).not.toBeFocused();
    await page.getByRole("button", { name: "Undo last vote" }).click();
    await expect(page.getByText(/Place 2 of \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo last vote" })).toHaveCount(0);
    await page.keyboard.press("Backspace");
    await expect(page.getByText(/Place 2 of \d+/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Place 2 of \d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo last vote" })).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Undo last vote" })).toBeVisible();
    await audit(page);
  } finally {
    await context.close();
  }
});

test("the landing preview cycles quietly, can pause, and stays still with reduced motion", async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const preview = page.getByRole("region", { name: "Example restaurant preview" });
  const yes = preview.getByRole("button", { name: "Yes, please", exact: true });
  await expect(preview.getByRole("heading", { name: "Late Night Pizza Decisions" })).toBeVisible();
  const before = await yes.boundingBox();
  await page.clock.fastForward(3500);
  await expect(preview.getByRole("heading", { name: "Noodle Situation" })).toBeVisible();
  expect((await yes.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await preview.getByRole("button", { name: "Pause preview" }).click();
  await page.mouse.move(0, 0);
  await page.getByRole("heading", { level: 1 }).click();
  await page.clock.fastForward(20_000);
  await expect(preview.getByRole("heading", { name: "Noodle Situation" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("landing-cycle.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.clock.fastForward(20_000);
  await expect(preview.getByRole("heading", { name: "Late Night Pizza Decisions" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Pause preview" })).toHaveCount(0);
  await preview.getByRole("button", { name: "Nope", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "Noodle Situation" })).toBeVisible();
  await audit(page);
});
