import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const discordDailyStatsTable = pgTable(
  "discord_daily_stats",
  {
    guildId: text("guild_id").notNull(),
    day: text("day").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    joins: integer("joins").notNull().default(0),
    leaves: integer("leaves").notNull().default(0),
    boosts: integer("boosts").notNull().default(0),
    peakVoice: integer("peak_voice").notNull().default(0),
    reportMessageId: text("report_message_id"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.day] }),
  ],
);

export const discordDailyChannelsTable = pgTable(
  "discord_daily_channels",
  {
    guildId: text("guild_id").notNull(),
    day: text("day").notNull(),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.day, table.channelId] }),
  ],
);

export const discordDailyUsersTable = pgTable(
  "discord_daily_users",
  {
    guildId: text("guild_id").notNull(),
    day: text("day").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.day, table.userId] }),
  ],
);

export type DiscordDailyStatsRow = typeof discordDailyStatsTable.$inferSelect;
export type DiscordDailyChannelRow = typeof discordDailyChannelsTable.$inferSelect;