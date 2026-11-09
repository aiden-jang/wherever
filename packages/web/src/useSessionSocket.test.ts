import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, type Session } from "@wherever/shared";
import { useSessionSocket } from "./useSessionSocket.js";

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = Socket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: unknown[] = [];
  constructor(readonly url: string) {
    Socket.instances.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
const session = (code: string): Session => ({
  id: code,
  code,
  status: "lobby",
  voteMode: "majority",
  filters: DEFAULT_FILTERS,
  participants: [],
});
const newest = () => Socket.instances.at(-1)!;

beforeEach(() => {
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("session socket ownership", () => {
  it("keeps a received result when the browser refuses its transition", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: () => {
        throw new Error("Snapshot unavailable");
      },
    });
    try {
      const hook = renderHook(() => useSessionSocket("ABCDEF", "Alex"));
      expect(() =>
        act(() =>
          newest().message({
            type: "match",
            restaurant: { id: "pizza", name: "Pizza" },
            rightSwipes: 1,
            totalParticipants: 1,
          }),
        ),
      ).not.toThrow();
      expect(hook.result.current.match).toMatchObject({ kind: "match", restaurant: { id: "pizza" } });
    } finally {
      Reflect.deleteProperty(document, "startViewTransition");
    }
  });

  it("clears the previous session and queued commands when the code changes", () => {
    const hook = renderHook(({ code }) => useSessionSocket(code, "Alex"), {
      initialProps: { code: "ABCDEF" },
    });
    act(() => newest().message({ type: "session_state", session: session("ABCDEF") }));
    act(() => hook.result.current.send({ type: "start_round" }));
    hook.rerender({ code: "GHJKLM" });
    expect(hook.result.current.session).toBeNull();
    expect(hook.result.current.everConnected).toBe(false);
    act(() => newest().open());
    expect(newest().sent).toHaveLength(1);
    expect(newest().sent[0]).toMatchObject({ type: "join", code: "GHJKLM" });
  });

  it("ignores delayed messages and opens from a disposed socket", () => {
    const hook = renderHook(({ code }) => useSessionSocket(code, "Alex"), {
      initialProps: { code: "ABCDEF" },
    });
    const old = newest();
    hook.rerender({ code: "GHJKLM" });
    act(() => old.open());
    act(() => old.message({ type: "session_state", session: session("ABCDEF") }));
    expect(old.sent).toEqual([]);
    expect(hook.result.current.session).toBeNull();
    expect(hook.result.current.status).toBe("connecting");
  });

  it("waits for the confirmed deck and scopes votes to the current round", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSessionSocket("ABCDEF", "Alex"));
    const vote = { type: "swipe", restaurantId: "pizza", direction: "right" } as const;
    act(() => newest().open());
    const join = newest().sent[0];
    act(() =>
      newest().message({ type: "session_state", session: { ...session("ABCDEF"), status: "swiping" } }),
    );
    act(() => hook.result.current.send(vote));
    expect(newest().sent).toEqual([join]);
    act(() => newest().message({ type: "deck", roundId: 3, restaurants: [] }));
    act(() => hook.result.current.send(vote));
    expect(newest().sent).toEqual([join, { ...vote, roundId: 3 }]);
    act(() => newest().close());
    act(() => hook.result.current.send(vote));
    act(() => vi.advanceTimersByTime(1000));
    act(() => newest().open());
    expect(newest().sent).toEqual([join]);
    act(() =>
      newest().message({ type: "session_state", session: { ...session("ABCDEF"), status: "swiping" } }),
    );
    act(() => newest().message({ type: "deck", roundId: 4, restaurants: [], alreadyVoted: ["tacos"] }));
    expect(hook.result.current.alreadyVoted).toEqual(["tacos"]);
    expect(hook.result.current.deckRevision).toBe(2);
    act(() => hook.result.current.send(vote));
    expect(newest().sent).toEqual([join, { ...vote, roundId: 4 }]);
  });

  it("reconnects when a live vote cannot be sent and trusts the restored ballot", () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSessionSocket("ABCDEF", "Alex"));
    act(() => newest().open());
    act(() =>
      newest().message({ type: "session_state", session: { ...session("ABCDEF"), status: "swiping" } }),
    );
    act(() => newest().message({ type: "deck", roundId: 1, restaurants: [] }));
    vi.spyOn(newest(), "send").mockImplementationOnce(() => {
      throw new Error("Connection lost");
    });
    expect(() =>
      act(() => hook.result.current.send({ type: "swipe", restaurantId: "pizza", direction: "right" })),
    ).not.toThrow();
    expect(hook.result.current.status).toBe("connecting");
    act(() => vi.advanceTimersByTime(1000));
    act(() => newest().open());
    expect(newest().sent).toEqual([expect.objectContaining({ type: "join" })]);
    act(() =>
      newest().message({ type: "session_state", session: { ...session("ABCDEF"), status: "swiping" } }),
    );
    act(() => newest().message({ type: "deck", roundId: 1, restaurants: [], alreadyVoted: [] }));
    expect(hook.result.current.alreadyVoted).toEqual([]);
  });

  it("ignores invalid JSON without breaking the next valid message", () => {
    const hook = renderHook(() => useSessionSocket("ABCDEF", "Alex"));
    expect(() => act(() => newest().onmessage?.({ data: "bad-json" }))).not.toThrow();
    act(() => newest().message({ type: "session_state", session: session("ABCDEF") }));
    expect(hook.result.current.session?.code).toBe("ABCDEF");
  });

  it("stops reconnecting and discards queued actions when a room expires", () => {
    vi.useFakeTimers();
    const hook = renderHook(({ code }) => useSessionSocket(code, "Alex"), {
      initialProps: { code: "ABCDEF" },
    });
    act(() => newest().open());
    act(() => newest().message({ type: "session_state", session: session("ABCDEF") }));
    expect(hook.result.current.session?.code).toBe("ABCDEF");
    act(() => newest().close(1008, "This room has expired. Start a new plan."));
    act(() => hook.result.current.send({ type: "start_round" }));
    act(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(60_000);
    });
    expect(Socket.instances).toHaveLength(1);
    expect(hook.result.current.status).toBe("closed");
    expect(hook.result.current.session).toBeNull();
    expect(hook.result.current.error).toContain("expired");
    hook.rerender({ code: "GHJKLM" });
    act(() => newest().open());
    expect(newest().sent).toHaveLength(1);
    expect(newest().sent[0]).toMatchObject({ type: "join", code: "GHJKLM" });
  });
});
