// Runtime validation at the trust boundary. Types vanish at runtime, so every
// inbound client message and HTTP body is parsed through these before the
// Worker / Durable Object trusts it.

import { z } from "zod";
import { REACTION_EMOJIS } from "./constants.js";

export const priceTierSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const sessionFiltersSchema = z.object({
  radiusMeters: z.number().int().positive().max(50_000),
  maxPriceTier: priceTierSchema,
  categories: z.array(z.string().min(1).max(40)).max(40),
  minRating: z.number().min(0).max(5).optional(),
  minReviews: z.number().int().min(0).max(100_000).optional(),
  openNow: z.boolean().optional(),
  sort: z.enum(["popularity", "distance"]).optional(),
  area: z.string().min(1).max(40).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const createSessionSchema = z.object({
  displayName: z.string().trim().min(1).max(24),
  filters: sessionFiltersSchema,
});

const joinSchema = z.object({
  type: z.literal("join"),
  code: z.string().trim().length(6),
  displayName: z.string().trim().min(1).max(24),
  clientId: z.string().min(1).max(64).optional(),
});

const startRoundSchema = z.object({ type: z.literal("start_round") });

const swipeSchema = z.object({
  type: z.literal("swipe"),
  restaurantId: z.string().min(1),
  direction: z.union([z.literal("left"), z.literal("right")]),
});

const decideNowSchema = z.object({ type: z.literal("decide_now") });

const againSchema = z.object({ type: z.literal("again") });

const reactSchema = z.object({
  type: z.literal("react"),
  emoji: z.enum(REACTION_EMOJIS),
});

/** Discriminated union of everything a client may send over the socket. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  joinSchema,
  startRoundSchema,
  swipeSchema,
  decideNowSchema,
  againSchema,
  reactSchema,
]);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
