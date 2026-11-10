import { once } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "./fixtures.js";

test.use({ serviceWorkers: "allow" });

test("the first visit is enough to reopen the landing page offline", async ({ page, baseURL }) => {
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
    const heading = page.getByRole("heading", { name: /Big appetites/ });
    await page.goto(origin);
    await expect(heading).toBeVisible();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    offline = true;
    await page.goto(`${origin}/?reopen`);
    await expect(heading).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a session" })).toHaveCSS("display", "flex");
  } finally {
    proxy.close();
    proxy.closeAllConnections();
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
