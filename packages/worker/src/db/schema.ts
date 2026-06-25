// Drizzle schema for D1 (SQLite). Durable, cross-session data only. Live vote
// tallies live in the Durable Object, not here.

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  status: text("status").notNull().default("lobby"),
  voteMode: text("vote_mode").notNull().default("majority"),
  // Filters stored as JSON text: { radiusMeters, maxPriceTier, categories }.
  filters: text("filters").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const visitedPlaces = sqliteTable("visited_places", {
  id: text("id").primaryKey(),
  sessionCode: text("session_code").notNull(),
  restaurantId: text("restaurant_id").notNull(),
  name: text("name").notNull(),
  visitedAt: integer("visited_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
