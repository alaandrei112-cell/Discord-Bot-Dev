import { pgTable, text, integer, boolean, timestamp, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface OracleMemoryEntry {
  text: string;
  createdAt: string;
  kind: "dialog" | "council";
}

export const playersTable = pgTable("players", {
  discordId: text("discord_id").notNull(),
  guildId: text("guild_id").notNull(),
  username: text("username").notNull(),
  xp: integer("xp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  reputation: integer("reputation").notNull().default(0),
  hp: integer("hp").notNull().default(100),
  maxLevel: integer("max_level").notNull().default(0),
  class: text("class"),
  classLevel: integer("class_level").notNull().default(1),
  classLevels: jsonb("class_levels").$type<Record<string, number>>().notNull().default({}),
  classPowerLevels: jsonb("class_power_levels").$type<Record<string, { power1: number; power2: number }>>().notNull().default({}),
  equipmentLevels: jsonb("equipment_levels").$type<Record<string, number>>().notNull().default({}),
  equippedWeapon: text("equipped_weapon"),
  equippedArmor: text("equipped_armor"),
  companion: text("companion"),
  companionLevel: integer("companion_level").notNull().default(1),
  oracleBond: integer("oracle_bond").notNull().default(0),
  oracleInteractions: integer("oracle_interactions").notNull().default(0),
  oracleChaos: integer("oracle_chaos").notNull().default(0),
  oracleTitle: text("oracle_title").notNull().default("Suflet necunoscut"),
  oracleMemory: jsonb("oracle_memory").$type<OracleMemoryEntry[]>().notNull().default([]),
  abilityEmpowerLevel: integer("ability_empower_level").notNull().default(0),
  abilityShieldLevel: integer("ability_shield_level").notNull().default(0),
  legacyAbilityRefunded: boolean("legacy_ability_refunded").notNull().default(false),
  honorTitle: text("honor_title"),
  deaths: integer("deaths").notNull().default(0),
  deathLevel: integer("death_level").notNull().default(0),
  retreats: integer("retreats").notNull().default(0),
  retreatLevel: integer("retreat_level").notNull().default(0),
  attackBonus: integer("attack_bonus").notNull().default(0),
  defenseBonus: integer("defense_bonus").notNull().default(0),
  dodgeBonus: integer("dodge_bonus").notNull().default(0),
  critBonus: integer("crit_bonus").notNull().default(0),
  maxHpBonus: integer("max_hp_bonus").notNull().default(0),
  shopAttackCount: integer("shop_attack_count").notNull().default(0),
  shopDefenseCount: integer("shop_defense_count").notNull().default(0),
  shopDodgeCount: integer("shop_dodge_count").notNull().default(0),
  shopCritCount: integer("shop_crit_count").notNull().default(0),
  shopHpCount: integer("shop_hp_count").notNull().default(0),
  keyRar:   integer("key_rar").notNull().default(0),
  keyEpic:  integer("key_epic").notNull().default(0),
  keyRegal: integer("key_regal").notNull().default(0),
  keyOase: integer("key_oase").notNull().default(0),
  keyFum: integer("key_fum").notNull().default(0),
  keyCavaler: integer("key_cavaler").notNull().default(0),
  keyPangarita: integer("key_pangarita").notNull().default(0),
  /** Consecutive ordinary chest claims; resets when pity pays out. */
  chestPity: integer("chest_pity").notNull().default(0),
  prestigeLevel: integer("prestige_level").notNull().default(0),
  prestigeAttackBonus: integer("prestige_attack_bonus").notNull().default(0),
  prestigeDefenseBonus: integer("prestige_defense_bonus").notNull().default(0),
  prestigeDodgeBonus: integer("prestige_dodge_bonus").notNull().default(0),
  prestigeCritBonus: integer("prestige_crit_bonus").notNull().default(0),
  prestigeHpBonus: integer("prestige_hp_bonus").notNull().default(0),
  bossKills: jsonb("boss_kills").$type<Record<string, number>>().notNull().default({}),
  talisman: text("talisman"),
  talismanLevel: integer("talisman_level").notNull().default(1),
  mana: integer("mana").notNull().default(100),
  manaLevel: integer("mana_level").notNull().default(0),
  manaRegenLevel: integer("mana_regen_level").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.discordId, t.guildId] })]);

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
