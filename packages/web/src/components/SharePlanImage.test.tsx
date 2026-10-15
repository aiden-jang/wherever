import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Restaurant } from "@wherever/shared";
import { SharePlanImage } from "./SharePlanImage.js";
import { createDinnerImage } from "../lib/dinnerImage.js";
vi.mock("../lib/dinnerImage.js", () => ({ createDinnerImage: vi.fn() }));
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "canShare");
  vi.resetAllMocks();
});
test("sharing is ready before the click and cancellation stays quiet", async () => {
  const file = new File(["image"], "wherever-dinner-2026-10-14.png", { type: "image/png" });
  vi.mocked(createDinnerImage).mockResolvedValue(file);
  const share = vi
    .fn()
    .mockRejectedValueOnce(new DOMException("closed", "AbortError"))
    .mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  render(
    <SharePlanImage restaurant={{ id: "dinner", name: "The Usual", address: "12 Main St" } as Restaurant} />,
  );
  const button = await screen.findByRole("button", { name: "Share plan image" });
  fireEvent.click(button);
  expect(share).toHaveBeenCalledWith({ files: [file] });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  expect(screen.queryByText(/Couldn’t share/)).toBeNull();
  fireEvent.click(button);
  await screen.findByText("Image handed to the share sheet.");
});
