import { afterEach, expect, it, vi } from "vitest";
import { createDinnerImage } from "./dinnerImage.js";

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps emoji together when restaurant names wrap on the plan image", async () => {
  const fillText = vi.fn();
  const ctx = new Proxy(
    { fillText, measureText: (text: string) => ({ width: Array.from(text).length * 100 }) },
    {
      get: (target, key) => Reflect.get(target, key) ?? (() => {}),
    },
  );
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
    callback(new Blob(["png"], { type: "image/png" })),
  );
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      async decode() {}
    },
  );
  const file = await createDinnerImage({
    name: "A".repeat(7) + "👩🏽‍💻" + "B".repeat(30),
    address: "Somewhere",
    googleMapsUri: "https://maps.google.com/?q=somewhere",
  });
  expect(file.type).toBe("image/png");
  expect(fillText.mock.calls.find(([, x, y]) => x === 104 && y === 488)?.[0]).toBe("A".repeat(7));
  expect(fillText.mock.calls.find(([, x, y]) => x === 104 && y === 558)?.[0]).toMatch(/^👩🏽‍💻B+$/);
});
