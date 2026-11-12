import { type Page } from "@playwright/test";
import type { ServerMessage, Session } from "@wherever/shared";
import { createRoom, expect, test } from "./fixtures.js";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const heading = (page: Page, name: string | RegExp) => page.getByRole("heading", { name });
const waiting = (page: Page) => heading(page, "Waiting for the group");

async function join(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("textbox", { name: "Your name" }).fill("Dinner guest");
  await button(page, "Join the session").click();
}

async function finishVoting(page: Page) {
  const progress = page.getByText(/^Place \d+ of \d+$/);
  await expect(progress).toBeVisible();
  const [, position, total] = (await progress.innerText()).match(/^Place (\d+) of (\d+)$/)!;
  await page.getByRole("main").focus();
  for (let index = Number(position); index <= Number(total); index += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(waiting(page)).toBeVisible();
}

test("a duplicated tab cannot overwrite votes and follows an Undo after reload", async ({
  page,
  context,
  browser,
}) => {
  await createRoom(page);
  const roomUrl = page.url();
  const ownSeat = await page.evaluate(() => Object.entries(sessionStorage));
  const copy = await context.newPage();
  let holdBallot = false;
  let held = false;
  await copy.routeWebSocket("**/ws/*", (socket) => {
    const upstream = socket.connectToServer();
    upstream.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage;
      if (holdBallot && message.type === "ballot") {
        held = true;
        return;
      }
      socket.send(raw);
    });
  });
  await copy.addInitScript((entries) => {
    for (const [key, value] of entries) sessionStorage.setItem(key, value);
  }, ownSeat);
  await copy.goto(roomUrl);
  await expect(button(copy, "Start swiping")).toBeEnabled();
  const guestContext = await browser.newContext({ serviceWorkers: "block" });
  try {
    const guest = await guestContext.newPage();
    await join(guest, roomUrl);
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await button(page, "Start swiping").click();
    await expect(copy.getByText(/Place 1 of/)).toBeVisible();
    holdBallot = true;
    await button(page, "Yes, please").click();
    await expect.poll(() => held).toBe(true);
    await expect(copy.getByText(/Place 1 of/)).toBeVisible();
    holdBallot = false;
    await button(copy, "Nope").click();
    await expect(copy.getByText(/Place 2 of/)).toBeVisible();
    await button(copy, "Nope").click();
    await expect(page.getByText(/Place 3 of/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Place 3 of/)).toBeVisible();
    await button(page, "Undo last vote").click();
    await expect(copy.getByText(/Place 2 of/)).toBeVisible();
    await expect(page.getByText(/Place 2 of/)).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test("rejoining restores the private shortlist and allows Undo", async ({ page, browser }) => {
  await createRoom(page);
  const roomUrl = page.url();
  const guests = await browser.newContext({ serviceWorkers: "block" });
  try {
    const guest = await guests.newPage();
    await join(guest, roomUrl);
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await button(page, "Start swiping").click();
    await finishVoting(page);
    await page.goto("/");
    await page.goto(roomUrl);
    await expect(waiting(page)).toBeVisible();
    await expect(page.getByText("Your private shortlist", { exact: true })).toBeVisible();
    await expect(page.getByText("10 liked", { exact: true })).toBeVisible();
    await expect(button(page, "Undo last vote")).toBeEnabled();
    await button(page, "Undo last vote").click();
    await expect(page.getByText("Place 10 of 10")).toBeVisible();
    await expect(guest.getByText("9 votes in", { exact: true })).toBeVisible();
  } finally {
    await guests.close();
  }
});

test("a guest can return to a finished group without losing their chance to vote", async ({
  page,
  browser,
}) => {
  await createRoom(page);
  const roomUrl = page.url();
  const guests = await browser.newContext({ serviceWorkers: "block" });
  try {
    const guest = await guests.newPage();
    await join(guest, roomUrl);
    await expect(page.getByText("2 people", { exact: true })).toBeVisible();
    await button(page, "Start swiping").click();
    await expect(button(guest, "Yes, please")).toBeEnabled();
    await finishVoting(page);
    await guest.goto("/");
    await expect(waiting(page)).toBeVisible();
    await guest.goto(roomUrl);
    await expect(button(guest, "Yes, please")).toBeEnabled();
    await button(guest, "Yes, please").click();
    await expect(guest.getByText(/Place 2 of/)).toBeVisible();
  } finally {
    await guests.close();
  }
});

test("the host can edit the search in the same room after exhausting new places", async ({ page }) => {
  await createRoom(page);
  const roomUrl = page.url();
  await expect(button(page, "Done editing")).toHaveAttribute("aria-expanded", "true");
  await page.getByText("10 mi", { exact: true }).click();
  await page.getByRole("button", { name: /Pizza/ }).click();
  await button(page, "Done editing").click();
  await button(page, "Start swiping").click();
  await expect(page.getByText("Place 1 of 1")).toBeVisible();
  await button(page, "Nope").click();
  await expect(heading(page, "No place got a yes vote.")).toBeVisible();
  await button(page, "Vote on new places").click();
  await expect(page.getByRole("alert")).toContainText("No new places turned up");
  await button(page, "Edit search").click();
  await expect(heading(page, "Dinner room")).toBeVisible();
  expect(page.url()).toBe(roomUrl);
  await expect(button(page, "Done editing")).toBeVisible();
  await page.getByRole("button", { name: /Pizza/ }).click();
  await button(page, "Start swiping").click();
  await expect(button(page, "Yes, please")).toBeEnabled();
});

test("late results and expired votes cannot replace or advance the current deck", async ({ page }) => {
  const pizza = {
    id: "pizza",
    name: "Test Pizza",
    category: "Pizza",
    priceTier: 2 as const,
    distanceMeters: 700,
    rating: null,
    reviewCount: null,
    address: null,
    imageUrl: null,
  };
  const session: Session = {
    id: "ABCDEF",
    code: "ABCDEF",
    status: "decided",
    voteMode: "majority",
    filters: { radiusMeters: 4800, maxPriceTier: 4, categories: [] },
    participants: [{ id: "self", displayName: "Host", isHost: true, connected: true }],
  };
  let send!: (message: ServerMessage) => void;
  const outgoing: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem("displayName", "Host"));
  await page.routeWebSocket("**/ws/*", (socket) => {
    send = (message) => socket.send(JSON.stringify(message));
    socket.onMessage((message) => {
      const { type } = JSON.parse(String(message)) as { type: string };
      outgoing.push(type);
      if (type !== "join") return;
      send({ type: "identity", participantId: "self" });
      send({ type: "session_state", session });
    });
  });
  await page.goto("/s/ABCDEF");
  await expect(heading(page, "Loading the dinner result")).toBeVisible();
  await expect(button(page, "Start swiping")).toHaveCount(0);
  const verdict: ServerMessage = {
    type: "match",
    restaurant: pizza,
    round: 1,
    rightSwipes: 1,
    totalParticipants: 1,
  };
  send(verdict);
  await expect(heading(page, /Dinner is handled/)).toBeVisible();
  await button(page, "Same places, vote again").click();
  await expect.poll(() => outgoing.includes("again")).toBe(true);
  send({ type: "deck", roundId: 2, restaurants: [pizza], roundEndsAt: Date.now() + 4000 });
  send({ type: "session_state", session: { ...session, status: "swiping" } });
  await expect(heading(page, "Pick your dinner")).toBeVisible();
  send(verdict);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText("Time’s up. Counting votes…")).toBeVisible();
  await expect(button(page, "Yes, please")).toBeDisabled();
  await expect(heading(page, "Pick your dinner")).toBeVisible();
  expect(outgoing).not.toContain("swipe");
});
