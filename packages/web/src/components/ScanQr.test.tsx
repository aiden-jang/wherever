import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ScanQr } from "./ScanQr.js";

const stop = vi.fn();
const detect = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.stubGlobal(
    "BarcodeDetector",
    class {
      detect = detect;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

test("a decoded QR result cannot act after closing the scanner", async () => {
  let resolve!: (hits: { rawValue: string }[]) => void;
  detect.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const onCode = vi.fn();
  const view = render(<ScanQr onCode={onCode} onClose={vi.fn()} />);
  await waitFor(() => expect(detect).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => resolve([{ rawValue: "ABCDEF" }]));
  expect(onCode).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
});

test("a decoder startup failure releases the camera and offers typing", async () => {
  vi.stubGlobal(
    "BarcodeDetector",
    class {
      constructor() {
        throw new Error("Unsupported");
      }
    },
  );
  render(<ScanQr onCode={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/type the code/i);
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Type it instead" })).toBeTruthy();
});

test("a camera playback failure releases the stream and explains recovery", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error("Playback refused"));
  render(<ScanQr onCode={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/type the code/i);
  expect(stop).toHaveBeenCalledOnce();
});
