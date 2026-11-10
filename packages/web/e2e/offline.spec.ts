import { once } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { audit, test, expect } from "./fixtures.js";

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
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  try {
    const origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    await run(origin, (value) => {
      offline = value;
    });
  } finally {
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
