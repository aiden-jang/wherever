import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RoomInvite } from "./RoomInvite.js";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

test("a blocked invite copy leaves a selectable link and an immediate retry", async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error("Blocked")).mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<RoomInvite code="ABCDEF" isHost={false} send={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  const fallback = await screen.findByRole("textbox", { name: "Invite link to copy" });
  expect((fallback as HTMLTextAreaElement).value).toBe(location.href);
  const retry = screen.getByRole("button", { name: "Copy link" });
  expect(retry.hasAttribute("disabled")).toBe(false);
  fireEvent.click(retry);
  await screen.findByRole("button", { name: "Link copied" });
  expect(screen.queryByRole("textbox", { name: "Invite link to copy" })).toBeNull();
});
