import { pgTable, text, timestamp, bigint, primaryKey } from "drizzle-orm/pg-core";

// Persists in-progress boss fight state so a server restart doesn't wipe
// active fights. Keyed by (eventId, guildId) composite PK — standalone bosses
// use Date.now() as eventId, so without guildId two guilds spawning at the
// same millisecond would collide on a single-column PK.
export const activeBossesTable = pgTable("active_bosses", {
  eventId: bigint("event_id", { mode: "number" }).notNull(),
  guildId: text("guild_id").notNull(),
  stateJson: text("state_json").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.guildId] })]);

export type ActiveBossRow = typeof activeBossesTable.$inferSelect;
