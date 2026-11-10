import type { Page } from "@playwright/test";
import { once } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { audit, createRoom, test, expect } from "./fixtures.js";

test.use({ serviceWorkers: "allow" });

async function withConnection(
  baseURL: string,
  run: (origin: string, setOffline: (offline: boolean) => void) => Promise<void>,
) {
  let offline = false;
  // Drop the connection at the origin so WebKit can still reach its service worker.
  const proxy = createServer((incoming, response) => {
    if (offline) {
      incoming.socket.destroy();
      return;
    }
    const upstream = request(new URL(incoming.url!, baseURL), { method: incoming.method }, (reply) => {
      response.writeHead(reply.statusCode!, { ...reply.headers, "cache-control": "no-store" });
      reply.pipe(response);
    });
    upstream.on("error", () => response.destroy());
    incoming.pipe(upstream);
  });
  const connections = new Set<Duplex>();
  proxy.on("upgrade", (incoming, socket, head) => {
    if (offline) return socket.destroy();
    const upstream = request(new URL(incoming.url!, baseURL), { headers: incoming.headers });
    upstream.on("upgrade", (reply, peer, pending) => {
      connections.add(socket);
      socket.once("close", () => {
        connections.delete(socket);
        peer.destroy();
      });
      peer.on("error", () => socket.destroy());
      socket.on("error", () => peer.destroy());
      const headers = reply.rawHeaders.map((part, index) => (index % 2 ? `${part}\r\n` : `${part}: `));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join("")}\r\n`);
      if (pending.length) socket.write(pending);
      if (head.length) peer.write(head);
      socket.pipe(peer).pipe(socket);
    });
    upstream.on("response", () => socket.destroy());
    upstream.on("error", () => socket.destroy());
    upstream.end();
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  try {
    const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    await run(origin, (value) => {
      offline = value;
      if (offline) for (const socket of connections) socket.destroy();
    });
  } finally {
    for (const socket of connections) socket.destroy();
    proxy.close();
    proxy.closeAllConnections();
  }
}

test("the first visit is enough to reopen the landing page offline", async ({ page, baseURL }) => {
  await withConnection(baseURL!, async (origin, setOffline) => {
    const heading = page.getByRole("heading", { name: /Big appetites/ });
    await page.goto(origin);
    await expect(heading).toBeVisible();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    setOffline(true);
    await page.goto(`${origin}/?reopen`);
    await expect(heading).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a session" })).toHaveCSS("display", "flex");
  });
});

test("an uncached invite offers Home offline and opens after reconnecting", async ({ page, baseURL }) => {
  await withConnection(baseURL!, async (origin, setOffline) => {
    await page.setViewportSize({ width: 320, height: 680 });
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const invite = `${origin}/s/ABCDEF`;
    const unavailable = page.getByRole("heading", { name: "Can’t open this invite" });
    const home = page.getByRole("heading", { name: /Big appetites/ });
    setOffline(true);
    await page.goto(invite);
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toBeFocused();
    await expect(page.getByText("Reconnect to the internet, then try again to join the room.")).toBeVisible();
    await expect
      .poll(() => page.locator("main img").evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await audit(page);

    await page.getByRole("link", { name: "Wherever, Honestly" }).click();
    await expect(home).toBeVisible();
    await page.goBack();
    await expect(unavailable).toBeVisible();
    await page.getByRole("link", { name: "Go home" }).click();
    await expect(home).toBeVisible();

    await page.goto(invite);
    await expect(unavailable).toBeVisible();
    setOffline(false);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page).toHaveURL(invite);
    await expect(page.getByRole("textbox", { name: "Your name" })).toBeVisible();
  });
});

async function joinByCode(page: Page, code: string, beforeSubmit?: () => Promise<void>) {
  await page.getByRole("button", { name: "Join with a code" }).click();
  const dialog = page.getByRole("dialog", { name: "Got a code?" });
  await dialog.getByRole("textbox", { name: "Your name" }).fill("Guest from Home");
  await dialog.getByRole("textbox", { name: "Session code" }).fill(code);
  await beforeSubmit?.();
  await dialog.getByRole("button", { name: "Join", exact: true }).click();
}

for (const entry of ["an invite link", "a room code"]) {
  test(`joining by code from Home works after opening ${entry} offline`, async ({
    page,
    context,
    baseURL,
  }) => {
    const host = await context.newPage();
    const code = await createRoom(host);
    await withConnection(baseURL!, async (origin, setOffline) => {
      await page.goto(origin);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      setOffline(true);
      if (entry === "an invite link") await page.goto(`${origin}/s/${code}`);
      else await joinByCode(page, code);
      await expect(page.getByRole("heading", { name: "Can’t open this invite" })).toBeVisible();

      await page.getByRole("link", { name: "Wherever, Honestly" }).click();
      await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
      setOffline(false);
      await joinByCode(page, code);
      await expect(page.getByRole("heading", { name: "Dinner room" })).toBeVisible();
      await expect(host.locator(".participant-tile").filter({ hasText: "Guest from Home" })).toBeVisible();
    });
  });
}

test("a cached invite shows offline guidance and joins after reconnecting", async ({
  page,
  context,
  baseURL,
}) => {
  const host = await context.newPage();
  const code = await createRoom(host);
  await withConnection(baseURL!, async (origin, setOffline) => {
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const invite = `${origin}/s/${code}`;
    const name = page.getByRole("textbox", { name: "Your name" });
    await page.goto(invite);
    await expect(name).toBeVisible();
    await page.waitForFunction(async () => {
      const runtime = await caches.open("wherever-v8");
      return (await runtime.keys()).some(({ url }) => /\/assets\/Lobby-[\w-]+\.js$/.test(url));
    });

    const guest = await context.newPage();
    setOffline(true);
    await guest.goto(invite);
    await expect(guest.getByRole("heading", { name: "Can’t open this invite" })).toBeFocused();
    const guestName = guest.getByRole("textbox", { name: "Your name" });
    await expect(guestName).toHaveCount(0);
    setOffline(false);
    await guest.getByRole("button", { name: "Try again" }).click();
    await expect(guest).toHaveURL(invite);
    await guestName.fill("Guest from cached invite");
    await guest.getByRole("button", { name: "Join the session" }).click();
    await expect(guest.getByRole("heading", { name: "Dinner room" })).toBeVisible();
    await expect(
      host.locator(".participant-tile").filter({ hasText: "Guest from cached invite" }),
    ).toBeVisible();
  });
});

test("joining by code waits for internet and automatically joins on reconnect", async ({
  page,
  context,
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  const hostContext = await browser.newContext({ baseURL, extraHTTPHeaders, serviceWorkers: "block" });
  try {
    const host = await hostContext.newPage();
    const code = await createRoom(host);
    await withConnection(baseURL!, async (origin, setOffline) => {
      await page.setViewportSize({ width: 320, height: 680 });
      await page.goto(`${origin}/s/${code}`);
      await expect(page.getByRole("textbox", { name: "Your name" })).toBeVisible();
      await page.getByRole("link", { name: "Wherever, Honestly" }).click();
      await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();

      await joinByCode(page, code, async () => {
        setOffline(true);
        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
      });
      await expect(page.getByRole("main").getByRole("status")).toHaveText(
        "Waiting for internet. You’ll join automatically when you reconnect.",
      );
      await audit(page);

      setOffline(false);
      await context.setOffline(false);
      await expect(page.getByRole("heading", { name: "Dinner room" })).toBeVisible();
      await expect(host.locator(".participant-tile").filter({ hasText: "Guest from Home" })).toBeVisible();
    });
  } finally {
    await hostContext.close();
  }
});

test("the installed shell stays public and reopens offline", async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== "chromium", "Playwright offline mode fails WebKit navigation to cached pages.");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
      );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.goto("/s/ABCDEF");
  await expect(page.getByRole("heading", { name: "And you are?" })).toBeVisible();
  expect(await page.evaluate(async () => (await caches.match("/"))?.url)).toBe(`${baseURL}/`);
  for (const name of ["Privacy", "Terms"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(name, "i") })).toBeVisible();
    await page.goto("/");
  }
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Big appetites/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a session", exact: true })).toBeEnabled();
  for (const name of ["Privacy", "Terms"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name: new RegExp(name, "i") })).toBeVisible();
    await page.goto("/");
  }
});
