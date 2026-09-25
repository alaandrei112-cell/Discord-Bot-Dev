import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

export const playerItemsTable = pgTable("player_items", {
  discordId: text("discord_id").notNull(),
  guildId:   text("guild_id").notNull(),
  itemKey:   text("item_key").notNull(),
  quantity:  integer("quantity").notNull().default(1),
  level:     integer("level").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.discordId, t.guildId, t.itemKey] })]);

export type PlayerItem = typeof playerItemsTable.$inferSelect;
