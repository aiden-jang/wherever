import { env } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Restaurant, ServerMessage } from "@wherever/shared";
import worker from "../src/index.js";
import type { Env } from "../src/env.js";
import type { UsageMeter } from "../src/usageMeter.js";
import { fetchFreshDeck, readDemoMode } from "../src/deckSource.js";
import { RoomPlaces, storedPlace } from "../src/roomPlaces.js";
import { sendResumedDeck, sendRoundPlace } from "../src/roundResume.js";

const bindings = { ...(env as unknown as Env), GOOGLE_PLACES_API_KEY: "budget-test-only" };
const meter = () => bindings.USAGE_METER.get(bindings.USAGE_METER.idFromName("global"));
const photoPath = () => `/api/photo?ref=places/test/photos/${crypto.randomUUID()}`;
const geocodePath = () => `/api/geocode?q=${crypto.randomUUID()}`;

async function request(path: string) {
  const context = createExecutionContext();
  const response = await worker.fetch(new Request(`https://budget.test${path}`), bindings, context);
  await waitOnExecutionContext(context);
  return response;
}

async function exhaust(kind: "search" | "photo" | "geocode") {
  await runInDurableObject(meter(), async (instance: UsageMeter, state) => {
    const current = await instance.stats();
    await state.storage.put("usage", { ...current, [kind]: current.caps[kind] });
  });
}

afterEach(() => vi.restoreAllMocks());

describe("provider budget enforcement", () => {
  it.each(["REQUEST_DENIED", "OVER_QUERY_LIMIT", "UNKNOWN_ERROR", "PRIVATE-REJECTION"])(
    "treats geocoding status %s as unavailable rather than an unknown town",
    async (status) => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ status, error_message: "private-location private-key", results: [] }),
      );
      const response = await request(geocodePath());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "Location search is unavailable. Try again shortly." });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE-REJECTION");
    },
  );

  it("keeps an actual zero-result geocode distinct from a provider failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: "ZERO_RESULTS", results: [] }));
    const response = await request(geocodePath());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Couldn't find that place." });
  });

  it("stores only place IDs and restores details within the shared search cap", async () => {
    const place = {
      id: "provider-id",
      displayName: { text: "Provider place" },
      formattedAddress: "Provider address",
      photos: [{ name: "places/provider-id/photos/photo-ref" }],
    };
    const filters = { radiusMeters: 8000, maxPriceTier: 4 as const, categories: [] };
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => Response.json({ places: [place] }))
      .mockImplementationOnce(async () => Response.json(place));
    const room = bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(crypto.randomUUID()));
    const stored = await runInDurableObject(room, async (_instance, state) => {
      const deck = await fetchFreshDeck({
        storage: state.storage,
        env: { ...bindings, RESTAURANT_SOURCE: "google" },
        meta: { code: "BUDGET", status: "lobby", voteMode: "majority", filters },
        vibeCounts: {},
      });
      expect(deck[0]?.name).toBe("Provider place");
      return (await state.storage.get<Restaurant[]>("deck"))!;
    });
    expect(stored).toEqual([expect.objectContaining({ id: "provider-id", imageUrl: null, address: null })]);
    expect(JSON.stringify(stored)).not.toMatch(/Provider place|Provider address|photo-ref/);

    const before = (await meter().stats()).search;
    const cold = new RoomPlaces(bindings);
    await expect(cold.showDeck(stored, filters)).resolves.toEqual([
      expect.objectContaining({ id: "provider-id", name: "Provider place", address: "Provider address" }),
    ]);
    expect(upstream).toHaveBeenLastCalledWith(
      "https://places.googleapis.com/v1/places/provider-id",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Goog-Api-Key": bindings.GOOGLE_PLACES_API_KEY }),
      }),
    );
    expect((await meter().stats()).search).toBe(before + 1);

    await exhaust("search");
    await expect(new RoomPlaces(bindings).showDeck(stored, filters)).resolves.toEqual(stored);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("uses labeled sample restaurants without contacting Google after the search cap", async () => {
    await exhaust("search");
    const upstream = vi.spyOn(globalThis, "fetch");
    const room = bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(crypto.randomUUID()));
    await runInDurableObject(room, async (_instance, state) => {
      await fetchFreshDeck({
        storage: state.storage,
        env: { ...bindings, RESTAURANT_SOURCE: "google" },
        meta: {
          code: "BUDGET",
          status: "lobby",
          voteMode: "majority",
          filters: { radiusMeters: 8000, maxPriceTier: 4, categories: [] },
        },
        vibeCounts: {},
      });
      expect(await readDemoMode(state.storage)).toBe("budget");
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("looks up only the next unvoted place from an idle deck and coalesces concurrent requests", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const id = String(url).split("/").at(-1)!;
      return Response.json({ id, displayName: { text: `Restaurant ${id}` } });
    });
    const room = bindings.SESSION_ROOM.get(bindings.SESSION_ROOM.idFromName(crypto.randomUUID()));
    await runInDurableObject(room, async (_instance, state) => {
      const storage = state.storage;
      const filters = { radiusMeters: 8000, maxPriceTier: 4 as const, categories: [] };
      const deck = Array.from({ length: 10 }, (_, index) =>
        storedPlace({ id: `place-${index}`, source: "google" } as Restaurant),
      );
      delete deck[1]!.detailsStatus;
      const firstVote = { participantId: "guest", restaurantId: "place-0", direction: "right" };
      await storage.put({
        meta: { code: "BUDGET", status: "swiping", voteMode: "majority", filters },
        roundNumber: 2,
        deck,
        votes: { "guest:place-0": firstVote },
      });
      const messages: ServerMessage[] = [];
      const close = vi.fn();
      const socket = {
        readyState: WebSocket.OPEN,
        deserializeAttachment: () => ({ participantId: "guest" }),
        send: (raw: string) => messages.push(JSON.parse(raw)),
        close,
      } as unknown as WebSocket;
      const places = new RoomPlaces(bindings);
      const before = (await meter().stats()).search;
      expect(await sendResumedDeck(storage, places, socket, "guest", false)).toBe(false);
      expect(close).toHaveBeenCalledWith(1008, expect.stringContaining("Reload"));
      expect(await sendResumedDeck(storage, places, socket, "guest", true)).toBe(true);
      expect(messages.at(-1)).toMatchObject({ type: "deck", alreadyVoted: ["place-0"] });
      expect(upstream).not.toHaveBeenCalled();

      await sendRoundPlace(storage, places, socket, 1, "place-1");
      await sendRoundPlace(storage, places, socket, 2, "place-7");
      expect(upstream).not.toHaveBeenCalled();
      const loadNext = () => sendRoundPlace(storage, places, socket, 2, "place-1");
      await Promise.all([loadNext(), loadNext()]);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(messages.at(-1)).toMatchObject({
        type: "round_place",
        restaurant: { name: "Restaurant place-1" },
      });
      expect((await meter().stats()).search).toBe(before + 1);

      await storage.put("votes", {
        "guest:place-0": firstVote,
        "guest:place-1": { ...firstVote, restaurantId: "place-1" },
      });
      await sendRoundPlace(storage, places, socket, 2, "place-2");
      expect(upstream).toHaveBeenCalledTimes(2);
      expect((await meter().stats()).search).toBe(before + 2);
    });
  });

  it.each([
    ["photo", photoPath],
    ["geocode", geocodePath],
  ] as const)("never contacts Google after the %s cap", async (kind, path) => {
    await exhaust(kind);
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not used"));
    expect((await request(path())).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("caps concurrent photo cache misses before sending upstream requests", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    const { caps } = await meter().stats();
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(photoPath())));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(caps.photo);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(12 - caps.photo);
    expect(upstream).toHaveBeenCalledTimes(caps.photo);
    expect((await meter().stats()).photo).toBe(caps.photo);
  });

  it.each([
    ["photo", photoPath],
    ["geocode", geocodePath],
  ] as const)("keeps failed %s attempts charged against the cap", async (kind, path) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const { caps } = await meter().stats();
    for (let i = 0; i < caps[kind]; i += 1) expect((await request(path())).status).toBe(502);
    expect((await request(path())).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(caps[kind]);
  });

  it.each([photoPath, geocodePath])(
    "keeps rejected provider response bodies out of logs for %s",
    async (path) => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("private-api-key private-location private-provider-message", { status: 403 }),
      );
      expect((await request(path())).status).toBe(502);
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-");
    },
  );

  it.each([
    ["photo", photoPath, () => new Response("photo", { headers: { "Content-Type": "image/jpeg" } })],
    [
      "geocode",
      geocodePath,
      () => Response.json({ status: "OK", results: [{ geometry: { location: { lat: 40, lng: -74 } } }] }),
    ],
  ] as const)("does not reuse %s content after the cap", async (kind, path, result) => {
    const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () => result());
    const url = path();
    const first = await request(url);
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    await exhaust(kind);
    expect((await request(url)).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([photoPath, geocodePath])("fails closed when the meter is unavailable for %s", async (path) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const upstream = vi.spyOn(globalThis, "fetch");
    const broken = {
      ...bindings,
      USAGE_METER: {
        idFromName: () => {
          throw new Error("meter unavailable");
        },
      },
    } as unknown as Env;
    const context = createExecutionContext();
    const response = await worker.fetch(new Request(`https://budget.test${path()}`), broken, context);
    expect(response.status).toBe(500);
    expect(upstream).not.toHaveBeenCalled();
  });
});
