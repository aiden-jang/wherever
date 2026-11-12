import { readFile, mkdir, copyFile } from "node:fs/promises";
import { test, expect, audit, createRoom, showLiveResultActions } from "./fixtures.js";

test("create, vote, decide, and run the same deck again", async ({ page }) => {
  await showLiveResultActions(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await createRoom(page, "Alex with a long display");
  await audit(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick your dinner" })).toBeVisible();
  await expect(page.getByRole("group", { name: /stars/ }).first()).toBeVisible();
  await audit(page);
  for (let i = 0; i < 30; i++) {
    if (await page.getByRole("heading", { name: /Dinner is handled/ }).isVisible()) break;
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(80);
  }
  await expect(page.getByRole("heading", { name: /Dinner is handled/ })).toBeVisible();
  await audit(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      },
    });
  });
  await page.getByRole("button", { name: "Send the plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Try sharing again" })).toBeVisible();
  const imageDownload = page.waitForEvent("download");
  await page.getByText("Plan image options", { exact: true }).click();
  await page.getByRole("button", { name: "Save plan image", exact: true }).click();
  const image = await imageDownload;
  expect(image.suggestedFilename()).toMatch(/^wherever-.+-\d{4}-\d{2}-\d{2}\.png$/);
  const imagePath = await image.path();
  const bytes = await readFile(imagePath!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
  if (process.env.UI_QA_CAPTURE) {
    await mkdir("../../test-results/visual-review", { recursive: true });
    await copyFile(imagePath!, "../../test-results/visual-review/dinner-plan.png");
    await page.screenshot({
      path: "../../test-results/visual-review/winner-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: "../../test-results/visual-review/winner-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole("button", { name: "Get directions", exact: true }).click();
  const directions = page.getByRole("dialog", { name: "How are we getting there?" });
  await directions.getByRole("button", { name: "Copy address instead" }).click();
  await expect(
    directions.getByRole("button", { name: "Couldn’t copy. Select the address above." }),
  ).toBeVisible();
  await directions.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Dinner is handled/ })).toBeVisible();
  await page.getByRole("button", { name: /same/i }).click();
  await expect(page.getByRole("heading", { name: "Pick your dinner" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a second person joins and participates in a shared anonymous round", async ({ page, browser }) => {
  const viewport = { width: 320, height: 640 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await showLiveResultActions(page);
  const votingBundles: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/SwipingRoom-[^/]+\.js$/.test(request.url())) votingBundles.push(request.url());
  });
  const code = await createRoom(page);
  const start = page.getByRole("button", { name: "Start swiping", exact: true });
  const roomCode = page.getByRole("button", { name: `Copy room code ${code}` });
  await roomCode.scrollIntoViewIfNeeded();
  await expect(roomCode).toBeInViewport({ ratio: 1 });
  const searchArea = page.getByRole("heading", { name: "Dinner filters" });
  await searchArea.scrollIntoViewIfNeeded();
  await expect(searchArea).toBeInViewport({ ratio: 1 });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Invite the group" })).toHaveCSS("min-height", "44px");
  const guest = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const friend = await guest.newPage();
    await friend.goto(`/s/${code}`);
    await friend.getByRole("textbox", { name: "Your name" }).fill("Alex");
    await friend.getByRole("button", { name: "Join room" }).click();
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await expect(friend.getByText("You’re in. Waiting on the host.")).toBeInViewport({ ratio: 1 });
    await expect(friend.getByRole("button", { name: "Start swiping", exact: true })).toHaveCount(0);
    expect(votingBundles).toEqual([]);
    await start.click();
    const like = page.getByRole("button", { name: "Yes, please", exact: true });
    const pass = friend.getByRole("button", { name: "Nope", exact: true });
    await expect(like).toBeInViewport({ ratio: 1 });
    await expect(pass).toBeInViewport({ ratio: 1 });
    expect(votingBundles).toHaveLength(1);
    await page.keyboard.press("ArrowRight");
    const undo = page.getByRole("button", { name: "Undo last vote" });
    await expect(undo).toBeInViewport({ ratio: 1 });
    await undo.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(undo).toBeVisible();
    await friend.keyboard.press("ArrowLeft");
    await expect(friend.getByText(/Place 2 of \d+/)).toBeVisible();
    await friend.reload();
    await expect(friend.getByText(/Place 2 of \d+/)).toBeVisible();
    await page.getByRole("button", { name: "Decide now" }).click();
    await page.getByRole("button", { name: "Decide anyway" }).click();
    await expect(friend.getByRole("heading", { name: /Dinner is handled/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Dinner is handled/ })).toHaveText(
      (await friend.getByRole("heading", { name: /Dinner is handled/ }).textContent()) ?? "",
    );
    await expect(page.getByRole("button", { name: "Get directions" })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Send the plan" })).toBeInViewport({ ratio: 1 });
  } finally {
    await guest.close();
  }
});

test("landing dialogs remain readable and keep keyboard focus at narrow widths", async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await audit(page);
    const trigger = page.getByRole("button", { name: "Join with a code" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Got a code?" });
    await dialog.getByRole("textbox", { name: "Your name" }).fill("Sam");
    await dialog.getByRole("textbox", { name: "Room code" }).fill("https://wherever.aidenjang.com/s/ABCDEF");
    await expect(dialog.getByRole("textbox", { name: "Room code" })).toHaveValue("ABCDEF");
    await audit(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("unknown routes and invalid session codes provide a way home", async ({ page }) => {
  await page.goto("/not-a-route");
  await audit(page);
  await page.goto("/s/ABCDEF");
  await page.getByRole("textbox", { name: "Your name" }).fill("Sam");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("heading", { name: "This code leads nowhere." })).toBeVisible();
  await audit(page);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
});

test("a failed create stays in one recoverable dialog and preserves the name", async ({ page }) => {
  await page.route("**/api/sessions", (route) =>
    route.fulfill({ status: 503, json: { error: "Restaurant setup is unavailable. Try again." } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Create a room", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a room" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Sam");
  await dialog.getByRole("button", { name: "Create room" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Restaurant setup is unavailable. Try again.");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("textbox", { name: "Your name" })).toHaveValue("Sam");
  await expect(dialog.getByRole("button", { name: "Create room" })).toBeEnabled();
  await audit(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("closing creation cancels its pending request and ignores a late response", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).endsWith("/api/sessions"))
        init?.signal?.addEventListener("abort", () => {
          document.documentElement.dataset.createRequestAborted = "true";
        });
      return original(input, init);
    };
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let responded!: () => void;
  let routeStarted = false;
  const lateResponse = new Promise<void>((resolve) => {
    responded = resolve;
  });
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/api/sessions", async (route) => {
    routeStarted = true;
    started();
    await held;
    try {
      await route.fulfill({ status: 201, json: { code: "ABCDEF" } });
    } finally {
      responded();
    }
  });
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Create a room", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create a room" });
    await dialog.getByRole("textbox", { name: "Your name" }).fill("Alex");
    await dialog.getByRole("button", { name: "Create room" }).click();
    await requestStarted;
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // A routed WebKit request reports requestfailed only after the route is released.
    await expect(page.locator("html")).toHaveAttribute("data-create-request-aborted", "true");
    release();
    await lateResponse;
    await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    release();
    if (routeStarted) await lateResponse;
  }
});

test("special votes can be undone and restaurant details suspend keyboard voting", async ({ page }) => {
  await createRoom(page);
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  const active = page.getByRole("group", { name: /stars/ }).first();
  await expect(active).toBeVisible();
  const first = await active.getAttribute("aria-label");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("button", { name: "Super-like, already used this round" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("button", { name: "Undo last vote", exact: true }).click();
  await expect(active).toHaveAttribute("aria-label", first!);
  await expect(page.getByRole("button", { name: "Super-like (one per round)", exact: true })).toHaveAttribute(
    "aria-disabled",
    "false",
  );
  await active.locator("[data-card-info]").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(active).toHaveAttribute("aria-label", first!);
  await audit(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(active).toHaveAttribute("aria-label", first!);
  await page.locator("main").focus();
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "Veto, already used this round" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("enlarged text and stronger contrast keep phone filters usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", contrast: "more" });
  await createRoom(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "20px";
  });
  await expect(page.getByRole("button", { name: "Done editing" })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Change area", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  const query = page.getByRole("textbox", { name: "ZIP code or town" });
  await query.fill("Brooklyn");
  const box = await query.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(120);
  await page.getByRole("button", { name: /House rules/ }).click();
  await audit(page);
});
