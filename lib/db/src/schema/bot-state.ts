import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Small durable key/value store for the bot's operational state that must
// survive a full redeploy / new container (where ephemeral on-disk markers in
// os.tmpdir() are wiped). Used for the Oracle "fell back to degraded mode"
// marker that gates the one-time recovery alert.
export const botStateTable = pgTable("bot_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BotState = typeof botStateTable.$inferSelect;
