import { pgTable, text, integer, boolean, primaryKey } from "drizzle-orm/pg-core";

export const playerDailyQuestsTable = pgTable("player_daily_quests", {
  discordId:   text("discord_id").notNull(),
  guildId:     text("guild_id").notNull(),
  questKey:    text("quest_key").notNull(),
  questDate:   text("quest_date").notNull(),
  progress:    integer("progress").notNull().default(0),
  completed:   boolean("completed").notNull().default(false),
  rewardGiven: boolean("reward_given").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.discordId, t.guildId, t.questKey] })]);

export type PlayerDailyQuest = typeof playerDailyQuestsTable.$inferSelect;
