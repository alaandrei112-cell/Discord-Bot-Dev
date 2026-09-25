import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

export const playerTalismansTable = pgTable("player_talismans", {
  discordId:   text("discord_id").notNull(),
  guildId:     text("guild_id").notNull(),
  talismanKey: text("talisman_key").notNull(),
  level:       integer("level").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.discordId, t.guildId, t.talismanKey] })]);

export type PlayerTalisman = typeof playerTalismansTable.$inferSelect;
