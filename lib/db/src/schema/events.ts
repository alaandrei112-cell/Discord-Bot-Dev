import { pgTable, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const activeEventsTable = pgTable("active_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  guildId: text("guild_id").notNull(),
  eventType: text("event_type").notNull(),
  messageId: text("message_id").notNull(),
  decreeMessageId: text("decree_message_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActiveEvent = typeof activeEventsTable.$inferSelect;

export const eventClaimsTable = pgTable(
  "event_claims",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer("event_id").notNull(),
    guildId: text("guild_id").notNull().default("1382035307607883816"),
    discordId: text("discord_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.eventId, t.discordId)],
);
