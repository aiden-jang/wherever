import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShareAction } from "./useShareAction.js";

const writeText = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
describe("share feedback", () => {
  it("reports clipboard failure so a press never silently disappears", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const hook = renderHook(() => useShareAction("room"));
    await act(() => hook.result.current.share({ url: "https://example.test" }, false));
    expect(hook.result.current.status).toBe("failed");
  });
  it("ignores a finished copy from the previous room", async () => {
    let done!: () => void;
    writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    const hook = renderHook(({ key }) => useShareAction(key), { initialProps: { key: "first" } });
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.share({ text: "first" }, false);
    });
    hook.rerender({ key: "second" });
    await act(async () => {
      done();
      await pending;
    });
    expect(hook.result.current.status).toBeNull();
  });
  it("does not copy when the person cancels the native share sheet", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
    });
    const hook = renderHook(() => useShareAction("room"));
    await act(() => hook.result.current.share({ text: "plan" }));
    expect(writeText).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBeNull();
    Reflect.deleteProperty(navigator, "share");
  });
  it("starts only one share when multiple events arrive in one frame", async () => {
    writeText.mockResolvedValue(undefined);
    const hook = renderHook(() => useShareAction("room"));
    await act(async () => {
      await Promise.all([
        hook.result.current.share({ text: "plan" }, false),
        hook.result.current.share({ text: "plan" }, false),
      ]);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe("copied");
  });
});
