// Runtime validation at the trust boundary. Types vanish at runtime, so every
// inbound client message and HTTP body is parsed through these before the
// Worker / Durable Object trusts it.

import { z } from "zod";
import { REACTION_EMOJIS } from "./constants.js";
import { VIBE_IDS } from "./vibes.js";

export const priceTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const sessionFiltersSchema = z.object({
  radiusMeters: z.number().int().positive().max(50_000),
  maxPriceTier: priceTierSchema,
  priceTiers: z.array(priceTierSchema).max(4).optional(),
  categories: z.array(z.string().min(1).max(40)).max(40),
  excludedCategories: z.array(z.string().min(1).max(40)).max(40).optional(),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().min(0).max(100_000).optional(),
  openNow: z.boolean().optional(),
  sort: z.enum(["popularity", "distance"]).optional(),
  shuffle: z.boolean().optional(),
  revealVoters: z.boolean().optional(),
  roundSeconds: z.number().int().min(0).max(3600).optional(),
  amenities: z
    .array(
      z.enum([
        "goodForGroups",
        "servesVegetarianFood",
        "outdoorSeating",
        "allowsDogs",
        "reservable",
        "takeout",
        "delivery",
        "servesCocktails",
        "servesBrunch",
        "liveMusic",
        "goodForChildren",
      ]),
    )
    .max(20)
    .optional(),
  area: z.string().min(1).max(40).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  locationLabel: z.string().min(1).max(80).optional(),
});

export const createSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(24),
  filters: sessionFiltersSchema,
});

/*
 * One definition, because it was bounded in one message and unbounded in three: a swipe could carry a
 * megabyte of id, and the vote map it keys is Durable Object storage.
 */
const restaurantId = z.string().min(1).max(200);

const joinSchema = z.object({
  type: z.literal("join"),
  code: z.string().trim().length(6),
  displayName: z.string().trim().min(1).max(24),
  clientId: z.string().min(1).max(64).optional(),
});

const startRoundSchema = z.object({ type: z.literal("start_round") });

const swipeSchema = z.object({
  type: z.literal("swipe"),
  restaurantId,
  direction: z.union([z.literal("left"), z.literal("right")]),
  super: z.boolean().optional(),
  veto: z.boolean().optional(),
});

const undoSwipeSchema = z.object({
  type: z.literal("undo_swipe"),
  restaurantId,
});

const decideNowSchema = z.object({ type: z.literal("decide_now") });

const againSchema = z.object({ type: z.literal("again"), deck: z.enum(["new", "same"]).optional() });

const chooseAlternativeSchema = z.object({
  type: z.literal("choose_alternative"),
  restaurantId,
});

const setPlanSchema = z.object({
  type: z.literal("set_plan"),
  planned: z
    .object({
      start: z.string().datetime({ offset: true }),
      duration: z.union([z.literal(60), z.literal(90), z.literal(120)]),
    })
    .nullable(),
});

const setVibeSchema = z.object({
  type: z.literal("set_vibe"),
  // Derived from VIBES so a new vibe cannot be added to the app and rejected at the door.
  vibe: z.enum(VIBE_IDS).nullable(),
});

const setFiltersSchema = z.object({
  type: z.literal("set_filters"),
  filters: sessionFiltersSchema,
});

const setNeverAgainSchema = z.object({
  type: z.literal("set_never_again"),
  restaurantId,
  neverAgain: z.boolean(),
});

const reactSchema = z.object({
  type: z.literal("react"),
  emoji: z.enum(REACTION_EMOJIS),
});

const nudgeThemSchema = z.object({ type: z.literal("nudge_them") });

/** Discriminated union of everything a client may send over the socket. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  joinSchema,
  startRoundSchema,
  swipeSchema,
  undoSwipeSchema,
  decideNowSchema,
  againSchema,
  chooseAlternativeSchema,
  setPlanSchema,
  setVibeSchema,
  setFiltersSchema,
  setNeverAgainSchema,
  reactSchema,
  nudgeThemSchema,
]);
