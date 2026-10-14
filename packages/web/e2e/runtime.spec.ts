import { connect } from "node:net";
import { test, expect, createRoom } from "./fixtures.js";

test("an interrupted upload leaves the Worker and live room usable", async ({ page, request, baseURL }) => {
  await createRoom(page);
  const roomURL = page.url();
  const origin = new URL(baseURL!);

  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(origin.port), origin.hostname);
    let disconnect: ReturnType<typeof setTimeout>;
    socket.setTimeout(5_000, () => socket.destroy(new Error("Upload socket did not close")));
    socket.once("error", reject);
    socket.once("close", () => {
      clearTimeout(disconnect);
      resolve();
    });
    socket.once("connect", () => {
      // Announce a body, send only its first byte, then hang up while the Worker reads it.
      // Wrangler used to treat this normal client cancellation as a fatal proxy error.
      socket.write(
        `POST /api/sessions HTTP/1.1\r\nHost: ${origin.host}\r\nContent-Type: application/json\r\nContent-Length: 65536\r\n\r\n{`,
        () => {
          disconnect = setTimeout(() => socket.destroy(), 100);
        },
      );
    });
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: /Waiting to start/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start swiping", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start swiping", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Swiping. Vote on tonight's places." })).toBeVisible();
  expect((await request.get("/api/health")).status()).toBe(200);
  await createRoom(page, "New session after cancellation");
  expect(page.url()).not.toBe(roomURL);
});
