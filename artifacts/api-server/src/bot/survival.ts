import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { SUPER_ADMIN_ID } from "./constants";
import type { EventParticipant } from "@workspace/db";
import type { Player } from "@workspace/db";
import type { PlayerItem } from "@workspace/db";
import {
  IMG,
  COMPANION_IMG,
  CHEST_IMG,
  KEY_IMG,
  CLASS_IMG,
  EQUIPMENT_IMG,
  monsterImg,
  bossImg,
} from "./assets";
import { getActiveBattleEvent, consumeStormDrain } from "./combat-events";
import {
  getCombatModifiers,
  formatActiveEffects,
  formatCombatEffects,
} from "./status-effects";
import type { GameplayConfig } from "./gameplay-config";

const BASE_PRICES = { atac: 50, def: 60, dodge: 70, crit: 80, hp: 40 } as const;
export type ShopKey = keyof typeof BASE_PRICES;
export const LEVELUP_INTERVAL = 5;

// ─── Mana system ─────────────────────────────────────────────────────────────
// Abilities consume mana instead of a timed cooldown. Every normal attack
// restores 10% of max mana; max mana grows infinitely via shop upgrades.
export const MANA_BASE = 100; // max mana at upgrade level 0
export const MANA_PER_LEVEL = 25; // extra max mana per upgrade level (infinite)
export const MANA_REGEN_PCT = 10; // % of max mana restored per normal attack
export const MANA_COST_BASE = 30; // ability mana cost at level 1
export const MANA_COST_PER_LEVEL = 10; // extra mana cost per ability level above 1
export const MANA_UPGRADE_BASE_COST = 150; // Oboli for the first mana upgrade
export const MANA_REGEN_PER_LEVEL = 2; // extra regen % per regen upgrade level
export const MANA_REGEN_UPGRADE_BASE_COST = 200; // Oboli for the first regen upgrade

/** Max mana at a given upgrade level (infinite levels). */
export function maxMana(manaLevel: number): number {
  return MANA_BASE + MANA_PER_LEVEL * Math.max(0, manaLevel);
}
/** Mana cost of using an ability at a given ability level — stronger abilities drain more. */
export function abilityManaCost(abilityLevel: number): number {
  return MANA_COST_BASE + MANA_COST_PER_LEVEL * Math.max(0, abilityLevel - 1);
}
/** Regen % of max mana restored by one normal attack (base 10%, +2%/regen level). */
export function manaRegenPct(regenLevel = 0): number {
  return MANA_REGEN_PCT + MANA_REGEN_PER_LEVEL * Math.max(0, regenLevel);
}
/** Mana restored by one normal attack (regen % of max, at least 1). */
export function manaRegenPerAttack(manaLevel: number, regenLevel = 0): number {
  return Math.max(
    1,
    Math.round((maxMana(manaLevel) * manaRegenPct(regenLevel)) / 100),
  );
}
/** Oboli cost to go from manaLevel to manaLevel+1 (15% growth, infinite). */
export function manaUpgradeCost(manaLevel: number): number {
  return Math.ceil(
    MANA_UPGRADE_BASE_COST *
      Math.pow(UPGRADE_COST_GROWTH, Math.max(0, manaLevel)),
  );
}
/** Oboli cost to go from manaRegenLevel to +1 (15% growth, infinite). */
export function manaRegenUpgradeCost(regenLevel: number): number {
  return Math.ceil(
    MANA_REGEN_UPGRADE_BASE_COST *
      Math.pow(UPGRADE_COST_GROWTH, Math.max(0, regenLevel)),
  );
}
/** Blue mana bar, same 10-segment style as the HP bar. */
export function manaBar(cur: number, max: number): string {
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  let f = Math.round(pct * 10);
  if (cur > 0 && f === 0) f = 1;
  return "🟦".repeat(f) + "⬛".repeat(10 - f);
}

// ─── Shared visual identity ──────────────────────────────────────────────────
// "Hub" / info embeds (profil, magazin, clasament, ajutor, clasă, companion)
// share this ash tone, the same footer, and the same section-divider rhythm so
// the whole interface reads as one product. Combat/chest/boss/death/levelup/
// retreat keep their semantic colors on purpose.
export const THEME_COLOR = 0x8a4a2f;
export const BRAND_FOOTER = "Regatul Cenușii — Cronica Umbrelor";
export function sectionTitle(label: string): string {
  return `**━━ ${label} ━━**`;
}

// ─── Monster rarities ──────────────────────────────────────────────────────
export type Rarity = "comun" | "rar" | "epic" | "legendar" | "mitic" | "boss";
export const RARITY: Record<
  Rarity,
  { label: string; emoji: string; color: number; rewardMult: number }
> = {
  comun: { label: "Comun", emoji: "⚪", color: 0x9aa0a6, rewardMult: 1 },
  rar: { label: "Rar", emoji: "🔵", color: 0x3b82f6, rewardMult: 1.5 },
  epic: { label: "Epic", emoji: "🟣", color: 0x8b5cf6, rewardMult: 2.5 },
  legendar: { label: "Legendar", emoji: "🟠", color: 0xf59e0b, rewardMult: 4 },
  mitic: { label: "Mitic", emoji: "🔴", color: 0xef4444, rewardMult: 8 },
  boss: { label: "MINI-BOSS", emoji: "🔥", color: 0xb91c1c, rewardMult: 2 },
};
export const RARITY_WEIGHTS: [Exclude<Rarity, "boss">, number][] = [
  ["comun", 690],
  ["rar", 220],
  ["epic", 80],
  ["legendar", 9],
  ["mitic", 1],
];

export function isMiniBoss(level: number): boolean {
  return level > 0 && level % 10 === 0;
}

/** Chance for a mini-boss to ambush the player at a normal (non-multiple-of-10) level. */
export const BOSS_AMBUSH_CHANCE = 0.03;

export function rollRarity(level: number): Rarity {
  if (isMiniBoss(level)) return "boss";
  if (Math.random() < BOSS_AMBUSH_CHANCE) return "boss";
  const total = RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

/** Special boss ability — fires when the charge bar fills up. */
export interface BossAbility {
  name: string;
  emoji: string;
  /** Damage as % of the victim's max HP when the ability fires. */
  pct: number;
  /** If true, the boss heals for the damage dealt (lifesteal). */
  steal?: boolean;
}

/** The 10 named mini-bosses — index matches boss_NN assets in assets.ts. */
export const BOSSES: { name: string; desc: string; ability: BossAbility }[] = [
  {
    name: "Păstrătorul Rânced",
    desc: "Respirația Ciumei — un nor toxic care roade viața și armura celor prinși în el.",
    ability: { name: "Respirația Ciumei", emoji: "🦴", pct: 15 },
  },
  {
    name: "Strigoiul Fără Maxilar",
    desc: "Țipătul Golului — un urlet care amuțește abilitățile și zguduie carnea.",
    ability: { name: "Țipătul Golului", emoji: "💀", pct: 10 },
  },
  {
    name: "Călăul cu Masca de Fier",
    desc: "Execuția Finală — marchează pe cei slăbiți și lovește cu putere dublă.",
    ability: { name: "Execuția Finală", emoji: "⚔️", pct: 20 },
  },
  {
    name: "Păpușarul de Sânge",
    desc: "Corzi de Carne — leagă victimele între ele și le fură sângele prin fire vii.",
    ability: { name: "Corzi de Carne", emoji: "🩸", pct: 12, steal: true },
  },
  {
    name: "Cântărețul de Sub Pământ",
    desc: "Simfonia Fracturii — unde sonore care crapă solul și dezorientează.",
    ability: { name: "Simfonia Fracturii", emoji: "🎶", pct: 15 },
  },
  {
    name: "Femeia cu Trei Fețe",
    desc: "Schimbarea Destinului — trece prin foc, gheață și umbre, șocând arena la fiecare schimbare.",
    ability: { name: "Schimbarea Destinului", emoji: "🔮", pct: 12 },
  },
  {
    name: "Regele Cenușii",
    desc: "Furtuna Cenușii — lame de cenușă care taie vindecarea și grăbesc lovitura regelui.",
    ability: { name: "Furtuna Cenușii", emoji: "👑", pct: 12 },
  },
  {
    name: "Mama Abisului",
    desc: "Privirea Abisului — o rază din ochiul central care arde tot ce stă nemișcat.",
    ability: { name: "Privirea Abisului", emoji: "🌑", pct: 25 },
  },
  {
    name: "Copilul cu Inima Externă",
    desc: "Pulsul Corupt — inima expusă absoarbe viața tuturor și o bea pentru sine.",
    ability: { name: "Pulsul Corupt", emoji: "❤️", pct: 10, steal: true },
  },
  {
    name: "Călătorul dintre Lumi",
    desc: "Fractura Dimensională — se rupe în trei forme și explodează la reîntregire.",
    ability: { name: "Fractura Dimensională", emoji: "🌌", pct: 15 },
  },
];

/** Attacks needed to fill the ability charge bar in a mini-boss fight. */
export const BOSS_CHARGE_MAX = 5;
/** Total hits needed to fill the shared ability charge bar on the final boss. */
export const FINAL_BOSS_CHARGE_MAX = 8;

/** "⚡ ▰▰▱▱▱"-style charge bar. */
export function chargeBar(charge: number, max: number): string {
  const c = Math.max(0, Math.min(max, charge));
  return "🟧".repeat(c) + "⬛".repeat(max - c);
}

/** Deterministic boss index for a level — 7 is coprime with 10, so all 10 rotate before repeating. */
export function bossIndex(level: number): number {
  return (((level * 7 + 3) % BOSSES.length) + BOSSES.length) % BOSSES.length;
}

/** Boss rank 1–10, grows with the level the boss appears at. */
export function bossRank(level: number): number {
  return Math.min(10, Math.max(1, Math.ceil(level / 10)));
}

// ─── Boss veteran ranks ─────────────────────────────────────────────────────
// Every boss a player defeats grows stronger for that player: the first kill
// gives it Rank I, then every 5 kills of the SAME boss rank it up again.
// Each rank adds +20% HP and +20% damage, capped at VETERAN_RANK_CAP (rank 10 → 3x).
// Tier labels stop at "Etern ⚫"; beyond that the numeric rank keeps climbing (up to the cap).
export const VETERAN_KILLS_PER_RANK = 5;
// Hard cap so long-running servers don't scale bosses into unbeatable HP sponges
// (rank 10 → veteranMult 3x max).
export const VETERAN_RANK_CAP = 10;
export const VETERAN_TIERS = [
  "",
  "Rar 🔵",
  "Epic 🟣",
  "Legendar 🟠",
  "Mitic 🔴",
  "Etern ⚫",
] as const;

/** Veteran rank (0, 1, 2, …) from how many times the player killed this boss. Capped at VETERAN_RANK_CAP. */
export function veteranRank(kills: number): number {
  if (kills <= 0) return 0;
  return Math.min(
    VETERAN_RANK_CAP,
    1 + Math.floor(kills / VETERAN_KILLS_PER_RANK),
  );
}

/** HP/damage multiplier for a veteran rank: +20% per rank, capped via VETERAN_RANK_CAP at spawn. */
export function veteranMult(rank: number): number {
  return 1 + 0.2 * Math.min(VETERAN_RANK_CAP, Math.max(0, rank));
}

/** Display label for a veteran rank — tiers cap at "Etern ⚫" for rank 5+. */
export function veteranTierLabel(rank: number): string {
  return VETERAN_TIERS[Math.min(rank, VETERAN_TIERS.length - 1)] ?? "";
}

// Bosses at the veteran rank cap (max difficulty, 3x HP/damage) drop bonus loot
// so long-running servers keep a reason to hunt "maxed" bosses.
export const VETERAN_MAX_REWARD_MULT = 1.5;

/** XP/Oboli reward multiplier for a boss at this veteran rank — ×1.5 at the cap, ×1 otherwise. */
export function veteranRewardMult(rank: number): number {
  return rank >= VETERAN_RANK_CAP ? VETERAN_MAX_REWARD_MULT : 1;
}

/** True when a kill takes this boss's veteran rank from below the cap to the cap (sub cap → cap). */
export function reachesVeteranCapOnKill(killsBefore: number): boolean {
  return (
    veteranRank(killsBefore) < VETERAN_RANK_CAP &&
    veteranRank(killsBefore + 1) >= VETERAN_RANK_CAP
  );
}

/**
 * Celebration line for the kill that takes the guild's standalone/final boss to
 * the veteran rank cap. Returns "" when the kill doesn't cross the cap or when
 * the kill count couldn't be read (null).
 */
export function finalBossVeteranCapLine(killsBefore: number | null): string {
  if (killsBefore === null || !reachesVeteranCapOnKill(killsBefore)) return "";
  return `🏆 **RANG VETERAN MAXIM ATINS!** Dragonul a ajuns la rangul veteran suprem — de acum, fiecare victorie împotriva lui aduce recompense ×${VETERAN_MAX_REWARD_MULT}!\n`;
}

/** Veteran rank of the boss at `level` for a player with these per-boss kill counts. */
export function veteranRankFor(
  level: number,
  rarity: string | null | undefined,
  bossKills: Record<string, number> | null | undefined,
): number {
  if (!isBossFight(level, rarity ?? undefined)) return 0;
  return veteranRank(bossKills?.[String(bossIndex(level))] ?? 0);
}

/** Max HP of the monster at spawn, scaled by the player's veteran rank when it's a boss. */
export function monsterSpawnHp(
  level: number,
  rarity: string | undefined,
  bossKills: Record<string, number> | null | undefined,
): number {
  return Math.round(
    monsterMaxHp(level, rarity) *
      veteranMult(veteranRankFor(level, rarity, bossKills)),
  );
}

/** The 14 named monsters — index matches MONSTER_IMG in assets.ts. */
export const MONSTERS: { name: string; desc: string }[] = [
  {
    name: "Golemul de Măduvă",
    desc: "Colos de os și piatră, cu inimă pulsând ca un blestem.",
  },
  {
    name: "Păstorul Umbrelor",
    desc: "Siluetă în zdrențe negre, cu toiag din vertebre și roi de umbre vii.",
  },
  {
    name: "Groparul Etern",
    desc: "Humanoid cenușiu, cu lopată neagră ce deschide morminte singure.",
  },
  {
    name: "Țesătoarea de Viscere",
    desc: "Creatură feminină contorsionată, țesând pânze din carne și sânge.",
  },
  {
    name: "Arhitectul Fumului Negru",
    desc: "Entitate fără chip, alcătuită din fum și cenușă, creator de structuri imposibile.",
  },
  {
    name: "Orfanul Sângeros",
    desc: "Copil palid cu ochi negri și o păpușă plină de ace, aducător de sângerări și umbre.",
  },
  {
    name: "Călăul Fără Maxilar",
    desc: "Gigant cu fața ruptă, purtând un topor masiv, cu maxilarul smuls.",
  },
  {
    name: "Femeia cu 100 de Colțuri",
    desc: "O entitate feminină cu membre fracturate în unghiuri imposibile.",
  },
  {
    name: "Strigătul din Fântână",
    desc: "O creatură acvatică, cu pielea albastră și ochii luminoși, care urlă din adâncuri.",
  },
  {
    name: "Călătorul cu Trei Fețe",
    desc: "Un nomad spectral cu trei expresii suprapuse: furie, tristețe, goliciune.",
  },
  {
    name: "Câinele cu Oasele pe Exterior",
    desc: "Un animal de vânătoare, cu scheletul expus și ochi roșii.",
  },
  {
    name: "Regina Cuibului de Viermi",
    desc: "O matroană monstruoasă, cu viermi ieșind din corpul ei ca niște copii.",
  },
  {
    name: "Cântărețul cu Gâtul Deschis",
    desc: "Un bard blestemat, cu gâtul tăiat, cântând printr-un gol în carne.",
  },
  {
    name: "Umbra care Poartă Oglinda",
    desc: "O entitate care reflectă nu imaginea ta, ci moartea ta viitoare.",
  },
];

/** Deterministic monster index for a level — 11 is coprime with 14, so all 14 rotate before repeating. */
export function monsterIndex(level: number): number {
  return (
    (((level * 11 + 5) % MONSTERS.length) + MONSTERS.length) % MONSTERS.length
  );
}

/** True when this fight is a boss fight — either a guaranteed mini-boss level or an ambush roll. */
export function isBossFight(level: number, rarity?: string): boolean {
  return rarity != null ? rarity === "boss" : isMiniBoss(level);
}

export function monsterName(level: number, rarity?: string): string {
  if (isBossFight(level, rarity)) return BOSSES[bossIndex(level)]!.name;
  return MONSTERS[monsterIndex(level)]!.name;
}

export function monsterDesc(level: number): string {
  return MONSTERS[monsterIndex(level)]!.desc;
}
export function monsterMaxHp(level: number, rarity?: string) {
  const base = 40 + level * 15;
  return isBossFight(level, rarity) ? Math.round(base * 2.5) : base;
}
export function monsterDmgRange(
  level: number,
  rarity?: string,
): [number, number] {
  const b = (5 + level * 1.5) * (isBossFight(level, rarity) ? 1.4 : 1);
  return [Math.max(1, Math.floor(b - 3)), Math.ceil(b + 3)];
}
export function monsterHitPct(level: number, rarity?: string) {
  return Math.min(90, 35 + level * 1.2 + (isBossFight(level, rarity) ? 5 : 0));
}
export function monsterReward(level: number, rarity: Rarity = "comun") {
  const mult = RARITY[rarity]?.rewardMult ?? 1;
  return {
    xp: Math.round(level * 10 * mult),
    oboli: Math.round(level * 3 * mult),
  };
}
export function shopPrice(key: ShopKey, count: number) {
  return Math.ceil(BASE_PRICES[key] * Math.pow(1.35, count));
}

// ─── Zones ─────────────────────────────────────────────────────────────────
const ZONES: { max: number; name: string; intro: string }[] = [
  {
    max: 10,
    name: "Pădurea Umbrelor",
    intro: "🌲 Copacii negri foșnesc, iar umbrele se târăsc printre rădăcini.",
  },
  {
    max: 25,
    name: "Catacombele Regale",
    intro: "🕯️ Umbrele sunt mai reci aici… și mai flămânde.",
  },
  {
    max: 50,
    name: "Ținuturile Arse",
    intro: "🔥 Pământul fumegă sub pași, iar cenușa nu se mai așază niciodată.",
  },
  {
    max: 100,
    name: "Turnul Vânturilor Negre",
    intro: "🗼 Vânturi întunecate urlă printre ziduri sfărâmate.",
  },
  {
    max: Infinity,
    name: "Abisul Fumegând",
    intro: "🌑 Ai pătruns în Abis. Doar cei eterni mai pot respira aici.",
  },
];
export function zoneFor(level: number) {
  return ZONES.find((z) => level <= z.max) ?? ZONES[ZONES.length - 1]!;
}

// ─── Level titles (evolutive) ───────────────────────────────────────────────
const LEVEL_TITLES: { max: number; title: string }[] = [
  { max: 5, title: "Umbra Începătorului" },
  { max: 10, title: "Călătorul Cenușii" },
  { max: 20, title: "Vânătorul Umbrelor" },
  { max: 40, title: "Sfărâmătorul Abisului" },
  { max: 80, title: "Arhontele Întunecat" },
  { max: 99, title: "Stăpânul Cenușii" },
  { max: Infinity, title: "Eternul Cenușii" },
];
export function levelTitle(level: number): string {
  return (LEVEL_TITLES.find((t) => level <= t.max) ?? LEVEL_TITLES[0]!).title;
}

// ─── RPG classes ─────────────────────────────────────────────────────────────
export type ClassKey =
  | "cavaler"
  | "umbrolog"
  | "strajer"
  | "alchimist"
  | "ratacitor";
export const CLASSES: Record<
  ClassKey,
  {
    label: string;
    emoji: string;
    desc: string;
    attack: number;
    hp: number;
    dodge: number;
    crit: number;
    xpMult: number;
    oboliMult: number;
  }
> = {
  cavaler: {
    label: "Cavaler",
    emoji: "🛡️",
    desc: "+2 daune, +5 HP",
    attack: 2,
    hp: 5,
    dodge: 0,
    crit: 0,
    xpMult: 1,
    oboliMult: 1,
  },
  umbrolog: {
    label: "Umbrologul",
    emoji: "🌀",
    desc: "+3% evitare, +1% critic",
    attack: 0,
    hp: 0,
    dodge: 3,
    crit: 1,
    xpMult: 1,
    oboliMult: 1,
  },
  strajer: {
    label: "Strajerul",
    emoji: "🔥",
    desc: "+10% XP câștigat",
    attack: 0,
    hp: 0,
    dodge: 0,
    crit: 0,
    xpMult: 1.1,
    oboliMult: 1,
  },
  alchimist: {
    label: "Alchimistul",
    emoji: "⚗️",
    desc: "+20% Oboli câștigați",
    attack: 0,
    hp: 0,
    dodge: 0,
    crit: 0,
    xpMult: 1,
    oboliMult: 1.2,
  },
  ratacitor: {
    label: "Ratacitor",
    emoji: "💨",
    desc: "+5% șansă de evitare",
    attack: 0,
    hp: 0,
    dodge: 5,
    crit: 0,
    xpMult: 1,
    oboliMult: 1,
  },
};
export function isClassKey(k: string): k is ClassKey {
  return k in CLASSES;
}

export type ClassPowerSlot = "power1" | "power2";
export type ClassPowerKind = "empower" | "shield";
export type ClassPower = {
  label: string;
  emoji: string;
  description: string;
  kind: ClassPowerKind;
};

/**
 * Every class owns its own two powers.  The combat engine intentionally keeps
 * the proven offensive/defensive mechanics, while the class determines the
 * identity, wording and progression of each power.
 */
export const CLASS_POWERS: Record<ClassKey, Record<ClassPowerSlot, ClassPower>> = {
  cavaler: {
    power1: {
      label: "Lovitura de Asediu",
      emoji: "⚔️",
      description: "Îți adună toată forța într-o lovitură grea care provoacă daune sporite.",
      kind: "empower",
    },
    power2: {
      label: "Scutul Regelui",
      emoji: "🛡️",
      description: "Ridică un scut cu viață proprie și reduce daunele primite.",
      kind: "shield",
    },
  },
  umbrolog: {
    power1: {
      label: "Tăișul din Umbră",
      emoji: "🌑",
      description: "Dispari pentru o clipă și reapari în lovitura următoare, cu daune sporite.",
      kind: "empower",
    },
    power2: {
      label: "Pasul Fantomă",
      emoji: "🌀",
      description: "Umbrele te înconjoară cu o protecție care absoarbe o parte din lovituri.",
      kind: "shield",
    },
  },
  strajer: {
    power1: {
      label: "Jurământul de Jar",
      emoji: "🔥",
      description: "Îți aprinde arma și întărește următorul atac împotriva monstrului.",
      kind: "empower",
    },
    power2: {
      label: "Zidul Veghei",
      emoji: "🏰",
      description: "Rămâi neclintit: scutul absoarbe daunele cât timp mai are viață.",
      kind: "shield",
    },
  },
  alchimist: {
    power1: {
      label: "Acid Coroziv",
      emoji: "⚗️",
      description: "Un amestec instabil roade armura și amplifică următoarea lovitură.",
      kind: "empower",
    },
    power2: {
      label: "Elixirul Cenușii",
      emoji: "🧪",
      description: "Un elixir protector cristalizează în jurul tău și absoarbe daunele.",
      kind: "shield",
    },
  },
  ratacitor: {
    power1: {
      label: "Ambuscadă",
      emoji: "🏹",
      description: "Lovești dintr-un unghi mort, pregătind o lovitură următoare mai puternică.",
      kind: "empower",
    },
    power2: {
      label: "Fumul de Retragere",
      emoji: "💨",
      description: "Dispari în fum și lași în urmă un văl care absoarbe loviturile.",
      kind: "shield",
    },
  },
};

export function isClassPowerSlot(k: string): k is ClassPowerSlot {
  return k === "power1" || k === "power2";
}

export function classPowerFor(
  classKey: string | null | undefined,
  slot: ClassPowerSlot,
): ClassPower | null {
  return classKey && isClassKey(classKey) ? CLASS_POWERS[classKey][slot] : null;
}

export function classPowerLevel(
  player: Pick<Player, "classPowerLevels">,
  classKey: ClassKey | null | undefined,
  slot: ClassPowerSlot,
): number {
  if (!classKey) return 0;
  const saved = player.classPowerLevels?.[classKey];
  return Math.max(0, Number(saved?.[slot] ?? 0));
}

export function classPowerEffectiveDesc(power: ClassPower, level: number): string {
  if (power.kind === "empower") {
    return `+${Math.round((empowerMult(level) - 1) * 100)}% daune la următoarea lovitură`;
  }
  return `absoarbe ${Math.round(shieldReduction(level) * 100)}% din daune, viață proprie ${shieldMaxHp(Math.max(1, level))} HP`;
}

// Effective class bonuses at a given level (base × 1.05^(level-1), like companions).
export function classStats(
  key: ClassKey,
  level: number,
): { attack: number; hp: number; dodge: number; crit: number } {
  const c = CLASSES[key];
  const m = bonusMult(level);
  return {
    attack: Math.round(c.attack * m),
    hp: Math.round(c.hp * m),
    dodge: Math.round(c.dodge * m),
    crit: Math.round(c.crit * m),
  };
}

// Cost for class upgrade: Oboli + XP + materials (scales with level).
export function classUpgradeCost(level: number): {
  gold: number;
  xp: number;
  items: { item: ItemKey; qty: number }[];
} {
  const gold = Math.ceil(
    UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, Math.max(0, level - 1)),
  );
  const xp = UPGRADE_XP_COST;
  const items: { item: ItemKey; qty: number }[] = [
    { item: "fragment_cenusa", qty: level * 2 },
    { item: "sange_monstru", qty: Math.ceil(level / 2) },
  ];
  if (level >= 3)
    items.push({ item: "esenta_umbrei", qty: Math.ceil(level / 3) });
  if (level >= 5)
    items.push({ item: "picatura_otr", qty: Math.ceil(level / 5) });
  return { gold, xp, items };
}

// ─── Shop economy: companions & abilities ─────────────────────────────────────
// Companions and abilities are bought with Oboli (gold) and then leveled up.
// Each upgrade consumes XP and Oboli; cost grows 15%/level, the offered bonus
// grows 5%/level (compound). Companions evolve (legendary art) at EVOLVE_LEVEL.
export const COMPANION_BUY_COST = 300; // one-time, Oboli
export const CLASS_SWITCH_COST = 500; // Oboli — training fee when picking a new class after a reset (first class is free)
export const ABILITY_BUY_COST = 250; // per ability unlock, Oboli
export const UPGRADE_BASE_COST = 200; // Oboli for the first upgrade
export const UPGRADE_COST_GROWTH = 1.15;
export const UPGRADE_BONUS_GROWTH = 1.05;
export const UPGRADE_XP_COST = 100; // XP consumed per upgrade
export const COMPANION_EVOLVE_LEVEL = 5; // companion level at which art evolves

// Oboli cost to go from `level` to `level+1`.
export function upgradeCost(level: number): number {
  return Math.ceil(
    UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_GROWTH, Math.max(0, level - 1)),
  );
}
// Multiplier applied to a base bonus at a given level (level 1 = ×1).
export function bonusMult(level: number): number {
  return Math.pow(UPGRADE_BONUS_GROWTH, Math.max(0, level - 1));
}
// Empower (Lovitura Umbrei): ×2 at level 1, the +100% bonus grows 5%/level.
export function empowerMult(level: number): number {
  if (level < 1) return 1;
  return 1 + bonusMult(level);
}
// Shield (Scut de Cenușă): 50% damage reduction at level 1, grows 5%/level (cap 90%).
export function shieldReduction(level: number): number {
  if (level < 1) return 0;
  return Math.min(0.9, 0.5 * bonusMult(level));
}
// Shield activation: flat mana cost; while active the shield has its OWN HP
// pool (grows with the ability level) that absorbs damage until it shatters.
export const SHIELD_ACTIVATION_COST = 350;
export const SHIELD_HP_BASE = 200; // shield HP at ability level 1
export const SHIELD_HP_PER_LEVEL = 100; // extra shield HP per ability level
// While the shield absorbs a hit, the strain also drains the bearer's mana:
// the drain % is tied to the shield's own defense — always 10 percentage
// points BELOW the shield's damage reduction (e.g. 98% apărare → 88% drain).
// The drained amount is a % of the absorbed damage, subtracted from current
// mana (floors at 0; an empty mana pool does NOT break the shield — only its
// own HP does).
export const SHIELD_MANA_DRAIN_OFFSET_PCT = 10;
export function shieldManaDrainPct(level: number): number {
  return Math.max(
    0,
    Math.round(shieldReduction(level) * 100) - SHIELD_MANA_DRAIN_OFFSET_PCT,
  );
}
export function shieldManaDrain(absorbed: number, level: number): number {
  return Math.max(0, Math.round((absorbed * shieldManaDrainPct(level)) / 100));
}
/** The shield's own life pool at a given ability level. */
export function shieldMaxHp(level: number): number {
  if (level < 1) return 0;
  return SHIELD_HP_BASE + SHIELD_HP_PER_LEVEL * (level - 1);
}
// The shield's "life" bar — drawn in purple to distinguish it from the HP
// (green/yellow/red) and mana (blue) bars.
export function shieldBar(cur: number, max: number): string {
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  let f = Math.round(pct * 10);
  if (cur > 0 && f === 0) f = 1;
  return "🟪".repeat(f) + "⬛".repeat(10 - f);
}

export type CompanionKey = "lup" | "corb" | "spirit" | "golem";
export const COMPANIONS: Record<
  CompanionKey,
  {
    label: string;
    emoji: string;
    desc: string;
    evoLabel: string;
    lore: string;
    attack: number;
    hp: number;
    crit: number;
    defense: number;
  }
> = {
  lup: {
    label: "Lupul de Cenușă",
    emoji: "🐺",
    desc: "+2 daune",
    evoLabel: "Alfa de Cenușă",
    lore: "Un lup spectral, credincios până în Abis.",
    attack: 2,
    hp: 0,
    crit: 0,
    defense: 0,
  },
  corb: {
    label: "Corbul Umbrelor",
    emoji: "🐦‍⬛",
    desc: "+3% critic",
    evoLabel: "Corbul de Jar",
    lore: "Ochii lui văd slăbiciunea oricărui monstru.",
    attack: 0,
    hp: 0,
    crit: 3,
    defense: 0,
  },
  spirit: {
    label: "Spiritul Stins",
    emoji: "👻",
    desc: "+5 HP",
    evoLabel: "Străjerul Eteric",
    lore: "O umbră blândă ce te ține în viață.",
    attack: 0,
    hp: 5,
    crit: 0,
    defense: 0,
  },
  golem: {
    label: "Golem de Fum",
    emoji: "🗿",
    desc: "-1 daune primite",
    evoLabel: "Colosul de Magmă",
    lore: "Un zid de cenușă între tine și moarte.",
    attack: 0,
    hp: 0,
    crit: 0,
    defense: 1,
  },
};
export function isCompanionKey(k: string): k is CompanionKey {
  return k in COMPANIONS;
}

export function isCompanionEvolved(companionLevel: number): boolean {
  return companionLevel >= COMPANION_EVOLVE_LEVEL;
}

// Effective bonuses for a companion at a given level (base × 1.05^(level-1)).
export function companionStats(
  key: CompanionKey,
  level: number,
): { attack: number; hp: number; crit: number; defense: number } {
  const c = COMPANIONS[key];
  const m = bonusMult(level);
  return {
    attack: Math.round(c.attack * m),
    hp: Math.round(c.hp * m),
    crit: Math.round(c.crit * m),
    defense: Math.round(c.defense * m),
  };
}
// Precise (unrounded) effective bonus for display, e.g. "+2.6 daune".
export function companionEffectiveDesc(
  key: CompanionKey,
  level: number,
): string {
  const c = COMPANIONS[key];
  const m = bonusMult(level);
  if (c.attack) return `+${(c.attack * m).toFixed(1)} daune`;
  if (c.crit) return `+${(c.crit * m).toFixed(1)}% critic`;
  if (c.hp) return `+${(c.hp * m).toFixed(1)} HP`;
  if (c.defense) return `-${(c.defense * m).toFixed(1)} daune primite`;
  return c.desc;
}

export const ABILITIES = {
  empower: {
    label: "Lovitura Umbrei",
    emoji: "🌑",
    desc: "Următoarea lovitură ×2 (crește 5%/nivel)",
  },
  shield: {
    label: "Scut de Cenușă",
    emoji: "🛡️",
    desc: `Scut cu viață proprie (${SHIELD_HP_BASE} HP, +${SHIELD_HP_PER_LEVEL}/nivel): absoarbe 50% din daune (crește 5%/nivel), activare ${SHIELD_ACTIVATION_COST} mană; efortul scutului consumă și mană (apărarea scutului −${SHIELD_MANA_DRAIN_OFFSET_PCT}% din daunele absorbite)`,
  },
} as const;
export type AbilityKey = keyof typeof ABILITIES;
export function isAbilityKey(k: string): k is AbilityKey {
  return k in ABILITIES;
}

// Effective ability bonus at a given level, for display ("+105% daune", "-52% daune primite").
export function abilityEffectiveDesc(kind: AbilityKey, level: number): string {
  if (kind === "empower") {
    const pct = Math.round((empowerMult(level) - 1) * 100);
    return `+${pct}% daune la următoarea lovitură`;
  }
  const pct = Math.round(shieldReduction(level) * 100);
  return `absoarbe ${pct}% din daune, viață proprie ${shieldMaxHp(Math.max(1, level))} HP, consum mană ${shieldManaDrainPct(level)}% din absorbit`;
}

// ─── Item drop system ─────────────────────────────────────────────────────────
export const ITEMS = {
  fragment_cenusa: {
    label: "Fragment de Cenușă",
    emoji: "🪨",
    rarity: "common",
  },
  esenta_umbrei: { label: "Esența Umbrei", emoji: "🌫️", rarity: "common" },
  sange_monstru: { label: "Sânge de Monstru", emoji: "🩸", rarity: "common" },
  picatura_otr: { label: "Picătură de Otravă", emoji: "💧", rarity: "common" },
  coama_dragonului: { label: "Coamă de Dragon", emoji: "🐉", rarity: "rare" },
  inima_abisului: { label: "Inimă a Abisului", emoji: "🌑", rarity: "rare" },
  solz_spectral: { label: "Solz Spectral", emoji: "💠", rarity: "rare" },
  cristal_abis: { label: "Cristal de Abis", emoji: "💎", rarity: "epic" },
  sange_titan: { label: "Sânge de Titan", emoji: "🧪", rarity: "legendary" },
  fragment_mitic: { label: "Fragment Mitic", emoji: "🌟", rarity: "mythic" },
  sigiliu_boss: { label: "Sigiliul Bossului", emoji: "🔥", rarity: "boss" },
  fragment_coroana: { label: "Fragment de Coroană", emoji: "👑", rarity: "mythic" },
  fragment_ochiul_cenușii: { label: "Fragment de Ochi al Cenușii", emoji: "👁️", rarity: "epic" },
  fragment_inima_abisului: { label: "Fragment de Inimă a Abisului", emoji: "🖤", rarity: "epic" },
  fragment_luna_stinsa: { label: "Fragment de Lună Stinsă", emoji: "🌘", rarity: "rare" },
  relic_coroana: { label: "Relicva Coroanei Cenușii", emoji: "👑", rarity: "mythic" },
  relic_ochiul: { label: "Relicva Ochiului Stins", emoji: "🔮", rarity: "legendary" },
  relic_inima: { label: "Relicva Inimii de Abis", emoji: "🖤", rarity: "legendary" },
  relic_luna: { label: "Relicva Lunii Negre", emoji: "🌑", rarity: "rare" },
  fragment_arma: { label: "Fragment de Armă", emoji: "⚔️", rarity: "rare" },
  fragment_armura: { label: "Fragment de Armură", emoji: "🛡️", rarity: "rare" },
  pumnalul_umbrei: { label: "Pumnalul Umbrei", emoji: "🗡️", rarity: "rare" },
  arcul_vanatorului: { label: "Arcul Vânătorului", emoji: "🏹", rarity: "rare" },
  ciocanul_de_jar: { label: "Ciocanul de Jar", emoji: "🔨", rarity: "epic" },
  catalizatorul_coroziv: { label: "Catalizatorul Coroziv", emoji: "⚗️", rarity: "epic" },
  sabia_regelui: { label: "Sabia Regelui", emoji: "⚔️", rarity: "legendary" },
  mantia_fantomei: { label: "Mantia Fantomei", emoji: "🥷", rarity: "rare" },
  pelerina_de_fum: { label: "Pelerina de Fum", emoji: "💨", rarity: "rare" },
  cuirasa_veghei: { label: "Cuirasa Veghei", emoji: "🛡️", rarity: "epic" },
  halatul_reagentului: { label: "Halatul Reagentului", emoji: "🧪", rarity: "epic" },
  platosa_cenusie: { label: "Platoșa Cenușie", emoji: "🛡️", rarity: "legendary" },
} as const;
export type ItemKey = keyof typeof ITEMS;
export function isItemKey(k: string): k is ItemKey {
  return k in ITEMS;
}

export type EquipmentSlot = "weapon" | "armor";
export type EquipmentDefinition = {
  slot: EquipmentSlot;
  label: string;
  emoji: string;
  description: string;
  image: string | null;
  oldMaterial: ItemKey;
  attack?: number;
  defense?: number;
  dodge?: number;
  crit?: number;
  hp?: number;
};

export const EQUIPMENT = {
  sabia_regelui: {
    slot: "weapon",
    label: "Sabia Regelui",
    emoji: "⚔️",
    description: "O sabie regală de oțel înnegrit, făcută pentru lovituri sigure și grele.",
    image: EQUIPMENT_IMG.sabia_regelui,
    oldMaterial: "sange_monstru",
    attack: 5,
  },
  pumnalul_umbrei: {
    slot: "weapon",
    label: "Pumnalul Umbrei",
    emoji: "🗡️",
    description: "Un pumnal subțire care găsește fisurile din apărarea monstrului.",
    image: EQUIPMENT_IMG.pumnalul_umbrei,
    oldMaterial: "esenta_umbrei",
    attack: 2,
    crit: 3,
  },
  ciocanul_de_jar: {
    slot: "weapon",
    label: "Ciocanul de Jar",
    emoji: "🔨",
    description: "Un ciocan greu, încă fierbinte în crăpăturile sale de bazalt.",
    image: EQUIPMENT_IMG.ciocanul_de_jar,
    oldMaterial: "sange_monstru",
    attack: 7,
  },
  arcul_vanatorului: {
    slot: "weapon",
    label: "Arcul Vânătorului",
    emoji: "🏹",
    description: "Un arc de lemn întunecat pentru lovituri rapide și precise.",
    image: EQUIPMENT_IMG.arcul_vanatorului,
    oldMaterial: "solz_spectral",
    attack: 3,
    dodge: 2,
  },
  catalizatorul_coroziv: {
    slot: "weapon",
    label: "Catalizatorul Coroziv",
    emoji: "⚗️",
    description: "Un catalizator alchimic care transformă fiecare lovitură într-o reacție periculoasă.",
    image: EQUIPMENT_IMG.catalizatorul_coroziv,
    oldMaterial: "picatura_otr",
    attack: 2,
    crit: 2,
  },
  platosa_cenusie: {
    slot: "armor",
    label: "Platoșa Cenușie",
    emoji: "🛡️",
    description: "O platoșă grea de oțel înnegrit, zgâriată de lupte vechi.",
    image: EQUIPMENT_IMG.platosa_cenusie,
    oldMaterial: "sange_monstru",
    defense: 4,
    hp: 10,
  },
  mantia_fantomei: {
    slot: "armor",
    label: "Mantia Fantomei",
    emoji: "🥷",
    description: "O mantie cenușie care se pierde în umbre înainte ca lovitura să ajungă.",
    image: EQUIPMENT_IMG.mantia_fantomei,
    oldMaterial: "esenta_umbrei",
    defense: 1,
    dodge: 3,
  },
  cuirasa_veghei: {
    slot: "armor",
    label: "Cuirasa Veghei",
    emoji: "🛡️",
    description: "O cuirasa a străjerilor, construită să țină linia în fața oricărui monstru.",
    image: EQUIPMENT_IMG.cuirasa_veghei,
    oldMaterial: "coama_dragonului",
    defense: 5,
    hp: 12,
  },
  halatul_reagentului: {
    slot: "armor",
    label: "Halatul Reagentului",
    emoji: "🧪",
    description: "Un halat alchimic întărit cu piele și catarame de cupru.",
    image: EQUIPMENT_IMG.halatul_reagentului,
    oldMaterial: "picatura_otr",
    defense: 2,
    crit: 1,
  },
  pelerina_de_fum: {
    slot: "armor",
    label: "Pelerina de Fum",
    emoji: "💨",
    description: "O pelerină ușoară care lasă în urmă doar fum și pași nesiguri.",
    image: EQUIPMENT_IMG.pelerina_de_fum,
    oldMaterial: "solz_spectral",
    defense: 1,
    dodge: 2,
    crit: 1,
  },
} as const satisfies Record<string, EquipmentDefinition>;
export type EquipmentKey = keyof typeof EQUIPMENT;

export function isEquipmentKey(k: string): k is EquipmentKey {
  return k in EQUIPMENT;
}

export function equipmentSlot(key: EquipmentKey): EquipmentSlot {
  return EQUIPMENT[key].slot;
}

export function equipmentLevel(
  player: Pick<Player, "equipmentLevels">,
  key: EquipmentKey,
): number {
  return Math.max(0, Number(player.equipmentLevels?.[key] ?? 0));
}

export function equipmentStats(key: EquipmentKey, level: number): {
  attack: number;
  defense: number;
  dodge: number;
  crit: number;
  hp: number;
} {
  const item: EquipmentDefinition = EQUIPMENT[key];
  const multiplier = Math.max(1, level);
  return {
    attack: (item.attack ?? 0) * multiplier,
    defense: (item.defense ?? 0) * multiplier,
    dodge: (item.dodge ?? 0) * multiplier,
    crit: (item.crit ?? 0) * multiplier,
    hp: (item.hp ?? 0) * multiplier,
  };
}

export function equipmentDesc(key: EquipmentKey, level: number): string {
  return equipmentStatsText(key, level);
}

export type EquipmentCost = {
  gold: number;
  xp: number;
  items: { item: ItemKey; qty: number }[];
};

export function equipmentCost(key: EquipmentKey, targetLevel: number): EquipmentCost {
  const item = EQUIPMENT[key];
  const step = Math.max(0, targetLevel - 1);
  const fragment = item.slot === "weapon" ? "fragment_arma" : "fragment_armura";
  return {
    gold: Math.ceil(500 * Math.pow(UPGRADE_COST_GROWTH, step)),
    xp: targetLevel === 1 ? 0 : UPGRADE_XP_COST + (targetLevel - 2) * 50,
    items: [
      { item: "fragment_cenusa", qty: 2 + targetLevel },
      { item: item.oldMaterial, qty: 1 + targetLevel },
      { item: fragment, qty: 2 + targetLevel },
    ],
  };
}

export function rollEquipmentMaterialDrop(
  rarity: string | null | undefined,
): ItemKey | null {
  if (!rarity) return null;
  const chance =
    rarity === "boss" ? 1 :
    rarity === "mitic" ? 0.8 :
    rarity === "legendar" ? 0.6 :
    rarity === "epic" ? 0.45 :
    rarity === "rar" ? 0.3 : 0.12;
  if (Math.random() >= chance) return null;
  return Math.random() < 0.5 ? "fragment_arma" : "fragment_armura";
}

/** Rolls a complete equipment item from a defeated monster. */
export function rollEquipmentDrop(
  monsterLevel: number,
  monsterRarity?: string | null,
): EquipmentKey | null {
  const chance = monsterRarity === "boss"
    ? 1
    : monsterRarity === "mitic"
      ? 0.5
      : monsterRarity === "legendar"
        ? 0.3
        : monsterLevel >= 50
          ? 0.12
          : monsterLevel >= 20
            ? 0.08
            : 0.05;
  if (Math.random() >= chance) return null;
  const keys = Object.keys(EQUIPMENT) as EquipmentKey[];
  const maxIndex = monsterLevel >= 50 ? keys.length : monsterLevel >= 20 ? 8 : 5;
  return keys[Math.floor(Math.random() * maxIndex)]!;
}

// ─── Rarity-based material drops ──────────────────────────────────────────────
// Each monster rarity has its own material that can drop on kill; the rarer the
// monster, the higher the drop chance. These materials feed talisman upgrades.
export const RARITY_MATERIAL: Record<
  Exclude<Rarity, "comun">,
  { item: ItemKey; chance: number }
> = {
  rar: { item: "solz_spectral", chance: 0.45 },
  epic: { item: "cristal_abis", chance: 0.6 },
  legendar: { item: "sange_titan", chance: 0.8 },
  mitic: { item: "fragment_mitic", chance: 1.0 },
  boss: { item: "sigiliu_boss", chance: 1.0 },
};

/** Rolls the rarity material for a defeated monster (null for comun or failed roll). */
export function rollMaterialDrop(
  rarity: string | null | undefined,
): ItemKey | null {
  if (!rarity || rarity === "comun") return null;
  const entry = RARITY_MATERIAL[rarity as Exclude<Rarity, "comun">];
  if (!entry) return null;
  return Math.random() < entry.chance ? entry.item : null;
}

/** Returns an item key that dropped, or null if nothing dropped. */
export function rollItemDrop(monsterLevel: number): ItemKey | null {
  if (Math.random() > 0.2) return null;
  const common: ItemKey[] = [
    "fragment_cenusa",
    "esenta_umbrei",
    "sange_monstru",
    "picatura_otr",
  ];
  if (monsterLevel < 20) {
    return common[Math.floor(Math.random() * common.length)]!;
  }
  if (monsterLevel < 50) {
    return common[Math.floor(Math.random() * common.length)]!;
  }
  if (Math.random() < 0.1) return "coama_dragonului";
  return common[Math.floor(Math.random() * common.length)]!;
}

// ─── Daily quest system ───────────────────────────────────────────────────────

export const DAILY_QUESTS = {
  kill_10: {
    label: "Ucide 10 monștri",
    description: "Combate 10 monștri în Ora Umbrelor.",
    target: 10,
    reward: { itemKey: "coama_dragonului" as ItemKey, qty: 1 },
    emoji: "⚔️",
  },
  rare_3: {
    label: "Vânează 3 monștri rari",
    description:
      "Ucide 3 monștri de raritate rară sau mai bună (inclusiv mini-bossi).",
    target: 3,
    reward: { itemKey: "solz_spectral" as ItemKey, qty: 2 },
    emoji: "💠",
  },
  boss_1: {
    label: "Răpune un mini-boss",
    description: "Învinge un mini-boss în Ora Umbrelor.",
    target: 1,
    reward: { itemKey: "cristal_abis" as ItemKey, qty: 1 },
    emoji: "🐲",
  },
} as const;

export type DailyQuestKey = keyof typeof DAILY_QUESTS;

export type DailyQuestDefinition = {
  label: string;
  description: string;
  target: number;
  reward: { itemKey: ItemKey; qty: number };
  emoji: string;
};

export function dailyQuestDefinitions(config?: GameplayConfig): Record<DailyQuestKey, DailyQuestDefinition> {
  const missions = config?.missions;
  return {
    kill_10: { ...DAILY_QUESTS.kill_10, target: missions?.kill_10.target ?? DAILY_QUESTS.kill_10.target, reward: { ...DAILY_QUESTS.kill_10.reward, qty: missions?.kill_10.rewardQty ?? DAILY_QUESTS.kill_10.reward.qty } },
    rare_3: { ...DAILY_QUESTS.rare_3, target: missions?.rare_3.target ?? DAILY_QUESTS.rare_3.target, reward: { ...DAILY_QUESTS.rare_3.reward, qty: missions?.rare_3.rewardQty ?? DAILY_QUESTS.rare_3.reward.qty } },
    boss_1: { ...DAILY_QUESTS.boss_1, target: missions?.boss_1.target ?? DAILY_QUESTS.boss_1.target, reward: { ...DAILY_QUESTS.boss_1.reward, qty: missions?.boss_1.rewardQty ?? DAILY_QUESTS.boss_1.reward.qty } },
  };
}

export function buildProgressBar(
  current: number,
  target: number,
  width: number,
): string {
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  let filled = Math.round(pct * width);
  if (current > 0 && filled === 0) filled = 1;
  return "🟦".repeat(filled) + "⬛".repeat(width - filled);
}

export type DailyQuestRowLike = {
  progress: number;
  completed: boolean;
  rewardGiven: boolean;
  questDate: string | null;
};

/** Renders one section per daily quest (all quests shown, each with its own bar). */
export function buildMissionEmbed(
  rows: Partial<Record<DailyQuestKey, DailyQuestRowLike>>,
  today: string,
  gameplayConfig?: GameplayConfig,
): EmbedBuilder {
  const quests = dailyQuestDefinitions(gameplayConfig);
  const sections = (Object.keys(quests) as DailyQuestKey[]).map((key) => {
    const quest = quests[key];
    const row = rows[key];
    const isToday = row?.questDate === today;
    const cur = isToday ? row!.progress : 0;
    const done = isToday && !!row?.completed;
    const bar = buildProgressBar(cur, quest.target, 10);
    const rewardItem = ITEMS[quest.reward.itemKey];

    let statusLine: string;
    if (done && row?.rewardGiven) {
      statusLine = "✅ **Completată!** Recompensa a fost acordată.";
    } else if (done) {
      statusLine =
        "✅ **Completată!** Recompensa va fi acordată la uciderea unui monstru.";
    } else {
      statusLine = `${quest.emoji} ${bar} **${cur}/${quest.target}**`;
    }

    return (
      `**${quest.label}**\n` +
      `${quest.description}\n` +
      `${statusLine}\n` +
      `🎁 Recompensă: ${rewardItem.emoji} **${quest.reward.qty}× ${rewardItem.label}**`
    );
  });

  return new EmbedBuilder()
    .setTitle("📜 Misiunile Zilnice")
    .setColor(THEME_COLOR)
    .setDescription(
      `${sectionTitle("Misiunile de Azi")}\n\n` +
        sections.join("\n\n") +
        `\n\n*Misiunile se resetează automat la miezul nopții (UTC).*`,
    )
    .setFooter({ text: BRAND_FOOTER });
}

// ─── Talisman system ──────────────────────────────────────────────────────────
// Talismans level infinitely. `values[level-1]` covers levels 1-5; past Nv.5 the
// passive keeps growing by the last per-level delta. Every TALISMAN_RANK_SIZE
// levels the talisman earns a visual Rank (🏅), just like shop stat upgrades.
export const TALISMAN_RANK_SIZE = 5;
/** @deprecated Levels are infinite now — kept only as the per-rank size. */
export const TALISMAN_MAX_LEVEL = 5;

/** Rank info for an infinite-level talisman: rank goes up every TALISMAN_RANK_SIZE levels. */
export function talismanRankInfo(level: number): {
  rank: number;
  inRank: number;
} {
  const lvl = Math.max(0, level);
  return {
    rank: Math.floor(lvl / TALISMAN_RANK_SIZE),
    inRank: lvl % TALISMAN_RANK_SIZE,
  };
}

/** Bar + rank badge line for a talisman level. */
export function talismanRankLine(level: number): string {
  const { rank, inRank } = talismanRankInfo(level);
  const bar = buildProgressBar(inRank, TALISMAN_RANK_SIZE, 10);
  return rank > 0 ? `${bar} 🏅 **Rank ${rank}**` : bar;
}
export const TALISMANS = {
  crista_vietii: {
    label: "Crista Vieții",
    emoji: "🔮",
    price: 250,
    passiveLabel: "Regen de viață",
    values: [15, 30, 45, 65, 90],
    fmt: (v: number) => `+${v} HP după uciderea unui monstru`,
    upgradeItems: {
      common: "fragment_cenusa" as ItemKey,
      rare: "coama_dragonului" as ItemKey,
    },
  },
  runa_sangelui: {
    label: "Runa Sângelui",
    emoji: "🩸",
    price: 300,
    passiveLabel: "Furt de viață",
    values: [8, 18, 28, 40, 55],
    fmt: (v: number) => `+${v} HP la fiecare lovitură critică`,
    upgradeItems: {
      common: "sange_monstru" as ItemKey,
      rare: "inima_abisului" as ItemKey,
    },
  },
  giulgiul_stins: {
    label: "Giulgiul Stins",
    emoji: "🌫️",
    price: 280,
    passiveLabel: "Reducere daune",
    values: [3, 7, 11, 16, 22],
    fmt: (v: number) => `-${v} din daunele primite de la monștri`,
    upgradeItems: {
      common: "esenta_umbrei" as ItemKey,
      rare: "coama_dragonului" as ItemKey,
    },
  },
  sfera_abisului: {
    label: "Sfera Abisului",
    emoji: "🌑",
    price: 350,
    passiveLabel: "Percepție abisală",
    values: [5, 12, 18, 25, 35],
    fmt: (v: number) => `+${v}% șansă de lovitură critică`,
    upgradeItems: {
      common: "picatura_otr" as ItemKey,
      rare: "inima_abisului" as ItemKey,
    },
  },
  piatra_eco: {
    label: "Piatra Eco",
    emoji: "🪨",
    price: 320,
    passiveLabel: "Rezonanță XP",
    values: [25, 60, 95, 135, 180],
    fmt: (v: number) => `+${v}% XP din fiecare monstru ucis`,
    upgradeItems: {
      common: "esenta_umbrei" as ItemKey,
      rare: "coama_dragonului" as ItemKey,
    },
  },
} as const;
export type TalismanKey = keyof typeof TALISMANS;
export function isTalismanKey(k: string): k is TalismanKey {
  return k in TALISMANS;
}

/** Passive magnitude for a talisman at a given level. Past the table (Nv.5) the
 *  value keeps growing by the last per-level delta — levels are infinite. */
export function talismanValue(key: TalismanKey, level: number): number {
  const values = TALISMANS[key].values;
  const lvl = Math.max(1, level);
  if (lvl <= values.length) return values[lvl - 1]!;
  const last = values[values.length - 1]!;
  const delta = last - values[values.length - 2]!;
  return last + delta * (lvl - values.length);
}

/** Human-readable passive description for a talisman at a given level. */
export function talismanDesc(key: TalismanKey, level: number): string {
  return TALISMANS[key].fmt(talismanValue(key, level));
}

/** Material cost to upgrade a talisman from `fromLevel` to `fromLevel + 1`.
 *  From Nv.5 up, each rank tier also demands its rarity material (dropped by
 *  rar/epic/legendar/mitic monsters and mini-bossi). */
export function talismanUpgradeCost(
  key: TalismanKey,
  fromLevel: number,
): {
  common: ItemKey;
  commonQty: number;
  rare: ItemKey;
  rareQty: number;
  tier: ItemKey | null;
  tierQty: number;
} {
  const t = TALISMANS[key].upgradeItems;
  const base = {
    common: t.common,
    commonQty: fromLevel + 2,
    rare: t.rare,
    rareQty: fromLevel,
  };
  if (fromLevel < TALISMAN_RANK_SIZE)
    return { ...base, tier: null, tierQty: 0 };
  const tierIdx = Math.min(4, Math.floor(fromLevel / TALISMAN_RANK_SIZE));
  const TIER_MATERIALS: ItemKey[] = [
    "solz_spectral",
    "solz_spectral",
    "cristal_abis",
    "sange_titan",
    "fragment_mitic",
  ];
  const tier = TIER_MATERIALS[tierIdx]!;
  const tierQty = (fromLevel % TALISMAN_RANK_SIZE) + 1;
  return { ...base, tier, tierQty };
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function hpBar(cur: number, max: number) {
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  let f = Math.round(pct * 10);
  if (cur > 0 && f === 0) f = 1;
  const color = pct > 0.6 ? "🟩" : pct > 0.3 ? "🟨" : "🟥";
  return color.repeat(f) + "⬛".repeat(10 - f);
}

export type CombatResult = {
  playerDmg: number;
  isCrit: boolean;
  /** Damage before crit/empower/battle-event multipliers — for the breakdown line. */
  baseDmg: number;
  monsterDefeated: boolean;
  monsterHit: boolean;
  monsterDmg: number;
  playerDodged: boolean;
  playerDied: boolean;
  newMonsterHp: number;
  newPlayerHp: number;
  xpGained: number;
  oboliGained: number;
  levelUp: boolean;
  newMonsterLevel: number;
  newMonsterRarity: Rarity;
  usedEmpower: boolean;
  usedShield: boolean;
  /** Total damage absorbed by the Ash Shield this round (drained from the shield's own HP). */
  shieldAbsorbed: number;
  /** True when the shield shattered this round (its HP couldn't cover the absorption). */
  shieldBroke: boolean;
  /** Shield HP remaining after this round (persist on the participant). */
  shieldHpLeft: number;
  /** Mana sapped by the shield strain this round (shieldManaDrainPct% of the absorbed damage). */
  shieldManaDrained: number;
  stormDrain: number;
  battleEventEmoji: string;
  /** HP restored by talisman passives (runa_sangelui life steal on crit). */
  hpRegen: number;
  /** Boss ability charge after this round (persisted on the participant). */
  newBossCharge: number;
  /** True when the boss's special ability fired this round. */
  abilityFired: boolean;
  /** Damage the ability dealt to the player (0 if not fired). */
  abilityDmg: number;
  /** HP the boss healed via lifesteal ability (0 if none). */
  abilityHeal: number;
  /** True when the defeated boss was at the max veteran rank and dropped the ×1.5 bonus reward. */
  veteranMaxBonus: boolean;
  /** True when THIS kill pushed the boss to the max veteran rank (celebrate the milestone once). */
  veteranRankMaxedNow: boolean;
};

export function doCombat(
  p: EventParticipant,
  talismanKey?: string | null,
  talismanLevel = 1,
  bossKills?: Record<string, number> | null,
  shieldHp?: number | null,
): CombatResult {
  const vetRank = veteranRankFor(p.monsterLevel, p.monsterRarity, bossKills);
  const vetMult = veteranMult(vetRank);
  const battle = getActiveBattleEvent();
  const mods = getCombatModifiers(p.discordId);
  const usedEmpower = p.empowerNext;
  // Ash Shield: while active, each hit is reduced by shieldReduction% and the
  // absorbed damage drains the shield's OWN HP pool; the shield shatters the
  // moment its HP can't cover the absorption.
  const shieldActive = p.shieldNext && p.shieldLevel >= 1;
  let shieldHpLeft = shieldHp ?? 0;
  let usedShield = false;
  let shieldAbsorbed = 0;
  let shieldBroke = false;
  const applyShield = (dmg: number): number => {
    if (!shieldActive || shieldBroke) return dmg;
    const reduced = Math.max(
      1,
      Math.round(dmg * (1 - shieldReduction(p.shieldLevel))),
    );
    const absorbed = Math.max(0, dmg - reduced);
    if (absorbed <= 0) return dmg;
    if (shieldHpLeft >= absorbed) {
      shieldHpLeft -= absorbed;
      shieldAbsorbed += absorbed;
      usedShield = true;
      return reduced;
    }
    shieldBroke = true;
    shieldHpLeft = 0;
    return dmg;
  };

  // sfera_abisului: bonus crit permanent per round
  const talismanCritAdd =
    talismanKey === "sfera_abisului"
      ? talismanValue("sfera_abisului", talismanLevel)
      : 0;

  const isCrit =
    Math.random() * 100 <
    Math.min(100, Math.max(0, p.critBonus + mods.critAdd + talismanCritAdd));
  const baseDmg = rand(10, 20) + p.attackBonus;
  let base = baseDmg;
  if (isCrit) base *= 2;
  if (usedEmpower) base = Math.round(base * empowerMult(p.empowerLevel));
  if (battle) base = Math.round(base * battle.damageMult);
  if (mods.damageMult !== 1) base = Math.round(base * mods.damageMult);
  const playerDmg = base;
  const newMHp = Math.max(0, p.monsterCurrentHp - playerDmg);
  const monsterDefeated = newMHp <= 0;

  let xpGained = 0,
    oboliGained = 0,
    newMonsterLevel = p.monsterLevel,
    levelUp = false;
  let newMonsterRarity: Rarity = p.monsterRarity as Rarity;
  const veteranMaxBonus = monsterDefeated && vetRank >= VETERAN_RANK_CAP;
  const bossKillsBefore = isBossFight(
    p.monsterLevel,
    p.monsterRarity ?? undefined,
  )
    ? (bossKills?.[String(bossIndex(p.monsterLevel))] ?? 0)
    : 0;
  const veteranRankMaxedNow =
    monsterDefeated &&
    isBossFight(p.monsterLevel, p.monsterRarity ?? undefined) &&
    reachesVeteranCapOnKill(bossKillsBefore);
  if (monsterDefeated) {
    const r = monsterReward(p.monsterLevel, p.monsterRarity as Rarity);
    const rewardMult = veteranRewardMult(vetRank);
    xpGained = Math.round(r.xp * rewardMult) + p.xpPerKill;
    oboliGained = Math.round(r.oboli * rewardMult);
    newMonsterLevel = p.monsterLevel + 1;
    newMonsterRarity = rollRarity(newMonsterLevel);
    levelUp = newMonsterLevel % LEVELUP_INTERVAL === 0;
  }

  // Smoke-storm drain hits the fighter once, regardless of the monster's turn.
  const stormDrain = consumeStormDrain(p.eventId, p.discordId);
  let newPlayerHp = Math.max(0, p.currentHp - stormDrain);
  let monsterHit = false,
    monsterDmg = 0,
    playerDodged = false,
    playerDied = newPlayerHp <= 0;

  if (!monsterDefeated && !playerDied) {
    const missBonus = battle?.monsterMissBonus ?? 0;
    monsterHit =
      Math.random() * 100 <
      monsterHitPct(p.monsterLevel, p.monsterRarity) - missBonus;
    if (monsterHit) {
      playerDodged = Math.random() * 100 < p.dodgeBonus;
      if (!playerDodged) {
        const [mn, mx] = monsterDmgRange(p.monsterLevel, p.monsterRarity);
        monsterDmg = Math.max(
          1,
          Math.round(rand(mn, mx) * vetMult) - p.defenseBonus,
        );
        // giulgiul_stins: flat damage reduction from monsters (can reduce to 0)
        if (talismanKey === "giulgiul_stins") {
          const reduction = talismanValue("giulgiul_stins", talismanLevel);
          monsterDmg = Math.max(0, monsterDmg - reduction);
        }
        monsterDmg = applyShield(monsterDmg);
        if (mods.damageTakenMult !== 1)
          monsterDmg = Math.max(
            1,
            Math.round(monsterDmg * mods.damageTakenMult),
          );
        newPlayerHp = Math.max(0, newPlayerHp - monsterDmg);
        playerDied = newPlayerHp <= 0;
      }
    }
  }

  // Boss ability charge bar: fills +1 each round in a mini-boss fight; when
  // full, the boss unleashes its special ability (% of the player's max HP,
  // some bosses also heal for that amount), then the bar resets.
  let newBossCharge = p.bossCharge ?? 0;
  let abilityFired = false,
    abilityDmg = 0,
    abilityHeal = 0;
  let finalMonsterHp = monsterDefeated
    ? monsterSpawnHp(newMonsterLevel, newMonsterRarity, bossKills)
    : newMHp;
  if (
    isBossFight(p.monsterLevel, p.monsterRarity as Rarity) &&
    !monsterDefeated
  ) {
    newBossCharge += 1;
    if (newBossCharge >= BOSS_CHARGE_MAX && !playerDied) {
      const ab = BOSSES[bossIndex(p.monsterLevel)]!.ability;
      abilityFired = true;
      abilityDmg = applyShield(
        Math.max(1, Math.round((p.maxHp * ab.pct) / 100)),
      );
      newPlayerHp = Math.max(0, newPlayerHp - abilityDmg);
      playerDied = newPlayerHp <= 0;
      if (ab.steal) {
        abilityHeal = abilityDmg;
        finalMonsterHp = Math.min(
          Math.round(
            monsterMaxHp(p.monsterLevel, p.monsterRarity as Rarity) * vetMult,
          ),
          finalMonsterHp + abilityHeal,
        );
      }
      newBossCharge = 0;
    }
  } else if (monsterDefeated) {
    newBossCharge = 0;
  }

  // runa_sangelui: life steal on crit — only if player survived
  const hpRegen =
    talismanKey === "runa_sangelui" && isCrit && !playerDied
      ? talismanValue("runa_sangelui", talismanLevel)
      : 0;

  return {
    playerDmg,
    isCrit,
    baseDmg,
    monsterDefeated,
    monsterHit,
    monsterDmg,
    playerDodged,
    playerDied,
    newMonsterHp: finalMonsterHp,
    newPlayerHp,
    xpGained,
    oboliGained,
    levelUp,
    newMonsterLevel,
    newMonsterRarity,
    usedEmpower,
    usedShield,
    shieldAbsorbed,
    shieldBroke,
    shieldHpLeft,
    shieldManaDrained: shieldManaDrain(shieldAbsorbed, p.shieldLevel),
    stormDrain,
    battleEventEmoji: battle?.emoji ?? "",
    hpRegen,
    newBossCharge,
    abilityFired,
    abilityDmg,
    abilityHeal,
    veteranMaxBonus,
    veteranRankMaxedNow,
  };
}

export function buildStartEmbed(expiresAt?: Date): EmbedBuilder {
  const timerLine = expiresAt
    ? `\n${sectionTitle("Timp rămas")}\n⏳ Evenimentul se încheie **<t:${Math.floor(expiresAt.getTime() / 1000)}:R>**`
    : "";
  return new EmbedBuilder()
    .setColor(0x1a0000)
    .setTitle("⚔️🔥  ORA UMBRELOR A ÎNCEPUT  🔥⚔️")
    .setDescription(
      "Umbrele se ridică din adâncuri, iar cenușa dansează în aer.\n" +
        "Regatul Cenușii cheamă luptătorii să își dovedească puterea.\n\n" +
        "Un val nesfârșit de creaturi se pregătește să vă înfrunte.\n" +
        "Apasă pe butonul sacru și intră în luptă.\n" +
        sectionTitle("Atenție") +
        "\n" +
        "💀 Moartea în acest eveniment este **definitivă**.\n" +
        "Cei căzuți în Umbre nu mai pot continua până la următoarea chemare.\n" +
        "🗝️ Învingând Dragonul poți găsi și **chei** ascunse în pradă." +
        timerLine,
    )
    .setTimestamp();
}

export function buildCombatEmbed(
  p: EventParticipant,
  extra = "",
  avatarUrl?: string | null,
  player?: Player | null,
  gameplayConfig?: GameplayConfig,
): EmbedBuilder {
  const rarity = (p.monsterRarity as Rarity) ?? "comun";
  const [mn, mx] = monsterDmgRange(p.monsterLevel, rarity);
  const vetRank = veteranRankFor(p.monsterLevel, rarity, player?.bossKills);
  const mMaxHp = Math.round(
    monsterMaxHp(p.monsterLevel, rarity) * veteranMult(vetRank),
  );
  const meta = RARITY[rarity] ?? RARITY.comun;
  const baseReward = monsterReward(p.monsterLevel, rarity);
  const rewardMult = veteranRewardMult(vetRank);
  const bossEconomy = isBossFight(p.monsterLevel, rarity);
  const goldMultiplier = bossEconomy
    ? (gameplayConfig?.economy.bossGoldMultiplier ?? 1)
    : (gameplayConfig?.economy.monsterGoldMultiplier ?? 1);
  const xpMultiplier = bossEconomy
    ? (gameplayConfig?.economy.bossXpMultiplier ?? 1)
    : (gameplayConfig?.economy.monsterXpMultiplier ?? 1);
  const reward = {
    xp: Math.round(baseReward.xp * rewardMult * xpMultiplier),
    oboli: Math.round(baseReward.oboli * rewardMult * goldMultiplier),
  };
  const zone = zoneFor(p.monsterLevel);
  const boss = bossEconomy;
  const title = boss
    ? `🔥 MINI-BOSS NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel, rarity)} 🔥`
    : `${meta.emoji} MONSTRU ${meta.label.toUpperCase()} NIVEL ${p.monsterLevel} – ${monsterName(p.monsterLevel, rarity)}`;
  const battle = getActiveBattleEvent();
  const effectsText = formatCombatEffects(p.discordId);
  const effectsSection = effectsText
    ? `\n\n🔮 **Efectele tale active:**\n${effectsText}`
    : "";
  const bonusLines: string[] = [];
  if (player?.class && isClassKey(player.class)) {
    const cls = CLASSES[player.class];
    const clsLvl = player.classLevel ?? 1;
    const cs = classStats(player.class, clsLvl);
    const clsParts = [
      cs.attack > 0 ? `+${cs.attack} daune` : "",
      cs.hp > 0 ? `+${cs.hp} HP` : "",
      cs.dodge > 0 ? `+${cs.dodge}% evitare` : "",
      cs.crit > 0 ? `+${cs.crit}% critic` : "",
      cls.xpMult !== 1 ? `XP ×${cls.xpMult}` : "",
      cls.oboliMult !== 1 ? `Oboli ×${cls.oboliMult}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    bonusLines.push(
      `${cls.emoji} **${cls.label}** Nv.${clsLvl} — ${clsParts || cls.desc}`,
    );
  }
  if (player?.companion && isCompanionKey(player.companion)) {
    const comp = COMPANIONS[player.companion];
    const compLvl = player.companionLevel ?? 1;
    const evolved = isCompanionEvolved(compLvl);
    bonusLines.push(
      `${comp.emoji} **${evolved ? comp.evoLabel : comp.label}** Nv.${compLvl}${evolved ? " ✨" : ""} — ${companionEffectiveDesc(player.companion, compLvl)}`,
    );
  }
  const talKey =
    player?.talisman && isTalismanKey(player.talisman) ? player.talisman : null;
  if (talKey) {
    const t = TALISMANS[talKey];
    const tLvl = player?.talismanLevel ?? 1;
    bonusLines.push(
      `${t.emoji} **${t.label}** Nv.${tLvl} — ${talismanDesc(talKey, tLvl)}`,
    );
  }
  if (p.xpPerKill > 0)
    bonusLines.push(
      `🔹 **+${p.xpPerKill} XP** la fiecare monstru ucis *(bonus level-up)*`,
    );
  const bonusSection = bonusLines.length
    ? `\n\n📌 **Bonusurile tale:**\n${bonusLines.join("\n")}`
    : "";
  const rewardXpStr =
    p.xpPerKill > 0
      ? `${reward.xp} XP *(+${p.xpPerKill} bonus)*`
      : `${reward.xp} XP`;
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(title)
    .setDescription(
      `🗺️ *${zone.name}* — ${zone.intro}\n\n` +
        (boss
          ? `👁️ *${BOSSES[bossIndex(p.monsterLevel)]!.desc}*\n` +
            `☠️ Rang boss: **${bossRank(p.monsterLevel)}/10** ${"🔥".repeat(bossRank(p.monsterLevel))}${"▱".repeat(10 - bossRank(p.monsterLevel))}\n` +
            (vetRank > 0
              ? `🏅 Rang veteran: **Rang ${vetRank} · ${veteranTierLabel(vetRank)}** — *te-a studiat! +${vetRank * 20}% viață și daune*\n`
              : "") +
            (vetRank >= VETERAN_RANK_CAP
              ? `👑 **RANG VETERAN MAXIM!** *Pradă de veteran suprem: recompensă ×${VETERAN_MAX_REWARD_MULT}!*\n`
              : "") +
            `${BOSSES[bossIndex(p.monsterLevel)]!.ability.emoji} Abilitate: **${BOSSES[bossIndex(p.monsterLevel)]!.ability.name}** ${chargeBar(p.bossCharge ?? 0, BOSS_CHARGE_MAX)}\n` +
            `⚡ *Când bara se umple, bossul își dezlănțuie abilitatea!*\n` +
            `💀 O prezență colosală blochează drumul. Recompensă dublă pentru cel care o doboară!\n\n`
          : `👁️ *${monsterDesc(p.monsterLevel)}*\n\n`) +
        (battle ? `${battle.emoji} *${battle.title} e activ acum!*\n\n` : "") +
        (extra ? `${extra}\n\n` : "") +
        `❤️ HP Monstru: **${p.monsterCurrentHp}/${mMaxHp}** ${hpBar(p.monsterCurrentHp, mMaxHp)}\n` +
        `⚔️ Daune: **${mn} – ${mx}**\n` +
        `🎯 Șansă lovitură: **${monsterHitPct(p.monsterLevel, rarity).toFixed(0)}%**\n` +
        `💰 Recompensă: **${rewardXpStr}, ${reward.oboli} Oboli**\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `❤️ HP-ul tău: **${p.currentHp}/${p.maxHp}** ${hpBar(p.currentHp, p.maxHp)}\n` +
        (player
          ? `🔷 Mana ta: **${player.mana ?? MANA_BASE}/${maxMana(player.manaLevel ?? 0)}** ${manaBar(player.mana ?? MANA_BASE, maxMana(player.manaLevel ?? 0))} *(+${manaRegenPct(player.manaRegenLevel ?? 0)}% la fiecare atac)*\n`
          : "") +
        (p.shieldNext
          ? `🛡️ Viața scutului: **${p.shieldHp ?? 0}/${shieldMaxHp(Math.max(1, p.shieldLevel))}** ${shieldBar(p.shieldHp ?? 0, shieldMaxHp(Math.max(1, p.shieldLevel)))}\n`
          : "") +
        `🪙 Oboli strânși în eveniment: **${p.oboli}** *(20% se pierd la moarte)*` +
        bonusSection +
        effectsSection,
    )
    .setImage(
      (boss
        ? bossImg(bossIndex(p.monsterLevel))
        : monsterImg(monsterIndex(p.monsterLevel), p.monsterRarity)) ??
        IMG.monster,
    )
    .setFooter({
      text: `⚔️ +${p.attackBonus} | 🛡️ +${p.defenseBonus} | 🌀 ${p.dodgeBonus}% | 💥 ${p.critBonus}% | ❤️ +${p.maxHp - 100}`,
    });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

const CRIT_LINES = [
  "💥 **LOVITURĂ DEVASTATOARE** 💥\nUmbrele se rup în două sub puterea ta!\nAi provocat **{dmg} daune critice**!",
  "🔥 **FURIA CENUȘII SE DEZLĂNȚUIE** 🔥\nLovitura ta a sfâșiat creatura pentru **{dmg} daune**!",
  "⚡ **IMPACT CATACLISMIC** ⚡\nCenușa explodează în jurul creaturii — **{dmg} daune**!",
];

export type RewardBreakdown = {
  /** XP/Oboli before class/effect/talisman multipliers (r.xpGained/oboliGained hold the final values). */
  baseXp: number;
  baseOboli: number;
  /** HP restored by Crista Vieții after the kill (0 = none). */
  cristaHeal?: number;
};

export function buildResultText(
  r: CombatResult,
  itemDrop?: ItemKey | null,
  breakdown?: RewardBreakdown,
): string {
  let txt = "";
  if (r.usedEmpower)
    txt += "🌑 **LOVITURA UMBREI!** Puterea Umbrelor îți dublează lovitura!\n";
  if (r.usedShield)
    txt += `🛡️ **SCUT DE CENUȘĂ activ!** A absorbit **${r.shieldAbsorbed}** daune *(viața scutului: ${r.shieldHpLeft} rămasă, −${r.shieldManaDrained} mană)*.\n`;
  if (r.shieldBroke)
    txt +=
      "💥 *Scutul de Cenușă s-a spart — viața lui nu a mai acoperit daunele! Lovitura te-a atins din plin.*\n";
  if (r.isCrit) {
    txt +=
      CRIT_LINES[Math.floor(Math.random() * CRIT_LINES.length)]!.replace(
        "{dmg}",
        String(r.playerDmg),
      ) + "\n";
  } else {
    txt += `⚔️ **AI LOVIT MONSTRUL!**\nLovitura ta a atins creatura pentru **${r.playerDmg} daune**.\nUmbrele se clatină în jurul ei.\n`;
  }
  if (r.playerDmg !== r.baseDmg) {
    const parts: string[] = [];
    if (r.isCrit) parts.push("💥 critică ×2");
     if (r.usedEmpower) parts.push("🌑 putere de clasă");
    if (r.battleEventEmoji) parts.push(`${r.battleEventEmoji} eveniment`);
    txt += `🗡️ Daune normale: **${r.baseDmg}** → cu ${parts.length ? parts.join(" + ") : "bonusuri"}: **${r.playerDmg}**\n`;
  }
  txt += "\n";
  if (r.abilityFired && r.abilityDmg > 0) {
    txt +=
      `⚡ **BOSSUL ÎȘI DEZLĂNȚUIE ABILITATEA!** Suferi **${r.abilityDmg} daune**!` +
      (r.abilityHeal > 0
        ? ` Bossul îți absoarbe viața și se vindecă cu **+${r.abilityHeal} HP**!`
        : "") +
      "\n";
  }
  if (r.stormDrain > 0)
    txt += `🌪️ Furtuna de Fum îți arde **${r.stormDrain} HP**!\n`;
  if (r.hpRegen > 0)
    txt += `🩸 **Runa Sângelui pulsează!** Absorbi **+${r.hpRegen} HP** din rana creaturii.\n`;
  if (breakdown?.cristaHeal)
    txt += `🔮 **Crista Vieții strălucește!** Recuperezi **+${breakdown.cristaHeal} HP** după victorie.\n`;
  if (r.monsterDefeated) {
    const xpStr =
      breakdown && breakdown.baseXp !== r.xpGained
        ? `+${r.xpGained} XP *(normal ${breakdown.baseXp})*`
        : `+${r.xpGained} XP`;
    const oboliStr =
      breakdown && breakdown.baseOboli !== r.oboliGained
        ? `+${r.oboliGained} Oboli *(normal ${breakdown.baseOboli})*`
        : `+${r.oboliGained} Oboli`;
    txt += `💀 **MONSTRUL A CĂZUT!** ${xpStr}, ${oboliStr}\n`;
    if (r.veteranMaxBonus) {
      txt += `👑 **TROFEU DE VETERAN SUPREM!** Bossul la rang veteran maxim ți-a lăsat pradă mărită *(recompensă ×${VETERAN_MAX_REWARD_MULT})*!\n`;
    }
    if (r.veteranRankMaxedNow) {
      txt += `🏆 **RANG VETERAN MAXIM ATINS!** Acest boss a ajuns la rangul veteran suprem — de acum, fiecare victorie împotriva lui îți aduce recompense ×${VETERAN_MAX_REWARD_MULT}!\n`;
    }
    if (itemDrop) {
      txt += `${ITEMS[itemDrop].emoji} **${ITEMS[itemDrop].label}** a căzut din monstru!\n`;
    }
    if (!r.levelUp) {
      const meta = RARITY[r.newMonsterRarity] ?? RARITY.comun;
      const label =
        r.newMonsterRarity === "boss"
          ? "🔥 UN MINI-BOSS"
          : `${meta.emoji} Un monstru ${meta.label}`;
      txt += `👁️ ${label} se ridică… **Nivel ${r.newMonsterLevel}**`;
    }
  } else if (r.monsterHit) {
    if (r.playerDodged) txt += "🌀 **AI EVITAT ATACUL!** Umbrele te-au ferit.";
    else
      txt += `💀 **MONSTRUL RIPOSTEAZĂ!**\nCreatura îți aplică **${r.monsterDmg} daune**.\nUmbrele îți apasă umerii, iar sângele îți pulsează în tâmple.`;
  } else {
    txt += "💨 Monstrul a ratat atacul!";
  }
  return txt;
}

/** "🎒 Pradă adunată: ..." line for the event summary (empty string when nothing was farmed). */
export function formatItemsFarmed(
  items?: Record<string, number> | null,
): string {
  if (!items) return "";
  const parts = Object.entries(items)
    .filter(([k, qty]) => qty > 0 && isItemKey(k))
    .map(
      ([k, qty]) =>
        `${ITEMS[k as ItemKey].emoji} **${qty}× ${ITEMS[k as ItemKey].label}**`,
    );
  return parts.length ? `🎒 Pradă adunată: ${parts.join(" · ")}\n` : "";
}

function formatEventReward(
  emoji: string,
  label: string,
  final: number,
  base: number,
): string {
  if (final <= 0) return "";
  if (final !== base && base > 0) {
    return `${emoji} **${final.toLocaleString()} ${label}** *(baza: ${base.toLocaleString()})*\n`;
  }
  return `${emoji} **${final.toLocaleString()} ${label}**\n`;
}

export function buildDeathEmbed(
  opts: {
    lostOboli?: number;
    totalDamage?: number;
    oboli?: number;
    xp?: number;
    baseOboli?: number;
    baseXp?: number;
    itemsFarmed?: Record<string, number> | null;
  } = {},
): EmbedBuilder {
  const {
    lostOboli = 0,
    totalDamage = 0,
    oboli = 0,
    xp = 0,
    baseOboli = 0,
    baseXp = 0,
    itemsFarmed,
  } = opts;
  const oboliLine = formatEventReward("🪙", "Oboli", oboli, baseOboli);
  const xpLine = formatEventReward("⭐", "XP", xp, baseXp);
  const itemsLine = formatItemsFarmed(itemsFarmed);
  const summary =
    totalDamage > 0 || oboli > 0 || xp > 0 || itemsLine
      ? `\n${sectionTitle("Rezumat Eveniment")}\n⚔️ Daune totale: **${totalDamage.toLocaleString()}**\n${oboliLine}${xpLine}${itemsLine}\n`
      : "";
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("💀  AI CĂZUT ÎN UMBRE 💀")
    .setDescription(
      "Umbrele te-au revendicat, iar cenușa îți acoperă pașii.\n" +
        "Nu mai poți continua acest eveniment.\n\n" +
        (lostOboli > 0
          ? `🪙 Ai pierdut **${lostOboli} Oboli** (20% din ce ai strâns în eveniment).\n\n`
          : "") +
        summary +
        "Trupul tău pământesc a cedat,\n" +
        "dar numele tău va rămâne scris în cronica celor căzuți.\n\n" +
        "Magazinul rămâne deschis — folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    )
    .setImage(IMG.death);
}

/** Real combat numbers the player fights with — mirrors the stat math used when
 *  joining fights (shop + prestigiu + clasă + companion + talisman crit). */
export function combatStatsValue(player: Player): string {
  const clsKey = player.class && isClassKey(player.class) ? player.class : null;
  const cls = clsKey ? classStats(clsKey, player.classLevel ?? 1) : null;
  const comp =
    player.companion && isCompanionKey(player.companion)
      ? companionStats(player.companion, player.companionLevel ?? 1)
      : null;
  const talKey =
    player.talisman && isTalismanKey(player.talisman) ? player.talisman : null;
  const talCrit =
    talKey === "sfera_abisului"
      ? talismanValue("sfera_abisului", player.talismanLevel ?? 1)
      : 0;
  const weapon =
    player.equippedWeapon && isEquipmentKey(player.equippedWeapon)
      ? equipmentStats(player.equippedWeapon, equipmentLevel(player, player.equippedWeapon))
      : null;
  const armor =
    player.equippedArmor && isEquipmentKey(player.equippedArmor)
      ? equipmentStats(player.equippedArmor, equipmentLevel(player, player.equippedArmor))
      : null;

  const maxHp =
    100 +
    player.maxHpBonus +
    player.prestigeHpBonus +
    (cls?.hp ?? 0) +
    (comp?.hp ?? 0) +
    (weapon?.hp ?? 0) +
    (armor?.hp ?? 0);
  const atk =
    player.attackBonus +
    player.prestigeAttackBonus +
    (cls?.attack ?? 0) +
    (comp?.attack ?? 0) +
    (weapon?.attack ?? 0) +
    (armor?.attack ?? 0);
  const def =
    player.defenseBonus +
    player.prestigeDefenseBonus +
    (comp?.defense ?? 0) +
    (weapon?.defense ?? 0) +
    (armor?.defense ?? 0);
  const dodge =
    player.dodgeBonus +
    player.prestigeDodgeBonus +
    (cls?.dodge ?? 0) +
    (weapon?.dodge ?? 0) +
    (armor?.dodge ?? 0);
  const crit =
    player.critBonus +
    player.prestigeCritBonus +
    (cls?.crit ?? 0) +
    (comp?.crit ?? 0) +
    (weapon?.crit ?? 0) +
    (armor?.crit ?? 0) +
    talCrit;

  return (
    `❤️ Viață maximă: **${maxHp} HP**\n` +
    `⚔️ Daune pe lovitură: **${10 + atk}–${20 + atk}** *(critic: ×2)*\n` +
    `🛡️ Apărare: **-${def}** daune primite   ·   🌀 Evitare: **${dodge}%**   ·   💥 Critic: **${Math.min(100, crit)}%**\n` +
    `*(totaluri cu magazin + prestigiu + clasă + companion + echipament${talCrit > 0 ? " + talisman" : ""})*`
  );
}

export function buildProfileEmbed(
  player: Player,
  title?: string,
  avatarUrl?: string | null,
  items: PlayerItem[] = [],
): EmbedBuilder {
  const cls =
    player.class && isClassKey(player.class) ? CLASSES[player.class] : null;
  const classImage =
    player.class && isClassKey(player.class) ? CLASS_IMG[player.class] : null;
  const rank = levelTitle(player.maxLevel);

  const classValue = cls
    ? `${cls.emoji} **${cls.label}**`
    : "*Fără clasă* — `/clasa`";
  const compValue =
    player.companion && isCompanionKey(player.companion)
      ? `${COMPANIONS[player.companion].emoji} **${isCompanionEvolved(player.companionLevel) ? COMPANIONS[player.companion].evoLabel : COMPANIONS[player.companion].label}** Nv.${player.companionLevel}${isCompanionEvolved(player.companionLevel) ? " ✨" : ""}`
      : "*Fără companion* — `/magazin`";
  const profileClassKey = player.class && isClassKey(player.class) ? player.class : null;
  const profilePowers = profileClassKey ? CLASS_POWERS[profileClassKey] : null;
  const abilValue = profileClassKey && profilePowers
    ? (["power1", "power2"] as ClassPowerSlot[])
        .map((slot) => {
          const power = profilePowers[slot];
          const level = classPowerLevel(player, profileClassKey, slot);
          return level >= 1
            ? `${power.emoji} ${power.label} Nv.${level} (${classPowerEffectiveDesc(power, level)})`
            : null;
        })
        .filter(Boolean)
        .join("\n") || "*Nicio putere de clasă deblocată* — `/magazin → Puteri`"
    : "*Fără clasă* — alege una cu `/clasa`";

  const equippedTalismanKey =
    player.talisman && isTalismanKey(player.talisman) ? player.talisman : null;
  const talismanRank = talismanRankInfo(player.talismanLevel ?? 1).rank;
  const talismanValue = equippedTalismanKey
    ? `${TALISMANS[equippedTalismanKey].emoji} **${TALISMANS[equippedTalismanKey].label}** Nv.${player.talismanLevel ?? 1}${talismanRank > 0 ? ` 🏅 Rank ${talismanRank}` : ""}\n↳ ${TALISMANS[equippedTalismanKey].passiveLabel}: ${talismanDesc(equippedTalismanKey, player.talismanLevel ?? 1)}`
    : "*Fără talisman* — `/magazin`";
  const equipmentValue = [
    player.equippedWeapon && isEquipmentKey(player.equippedWeapon)
      ? `${EQUIPMENT[player.equippedWeapon].emoji} **${EQUIPMENT[player.equippedWeapon].label}** Nv.${equipmentLevel(player, player.equippedWeapon)}`
      : "*Fără armă echipată*",
    player.equippedArmor && isEquipmentKey(player.equippedArmor)
      ? `${EQUIPMENT[player.equippedArmor].emoji} **${EQUIPMENT[player.equippedArmor].label}** Nv.${equipmentLevel(player, player.equippedArmor)}`
      : "*Fără armură echipată*",
  ].join("\n");

  const deathInfo =
    player.deaths > 0
      ? `${player.deaths}× (ultima: Nivel ${player.deathLevel})`
      : "Neînvins";
  const retreatInfo =
    player.retreats > 0
      ? `${player.retreats}× (ultima: Nivel ${player.retreatLevel})`
      : "Niciodată";

  const totalKeys = player.keyRar + player.keyEpic + player.keyRegal + player.keyOase + player.keyFum + player.keyCavaler + player.keyPangarita;
  const keysValue =
    totalKeys > 0
      ? [
          ["rar", player.keyRar],
          ["epic", player.keyEpic],
          ["regal", player.keyRegal],
          ["oase", player.keyOase],
          ["fum", player.keyFum],
          ["cavaler", player.keyCavaler],
          ["pangarita", player.keyPangarita],
        ].map(([key, count]) => `${KEY_EMOJI[String(key)]} **${count}** ${KEY_LABEL[String(key)]}`).join("   ·   ")
      : "*Niciun trofeu sub formă de cheie încă — caută cuferele de chei!*";

  const prestigeValue =
    player.prestigeLevel > 0
      ? `⭐ **Nivel ${player.prestigeLevel}**\n⚔️ +${player.prestigeAttackBonus} · 🛡️ +${player.prestigeDefenseBonus} · 🌀 +${player.prestigeDodgeBonus}% · 💥 +${player.prestigeCritBonus}% · ❤️ +${player.prestigeHpBonus} · 🪙 +${player.prestigeLevel * PRESTIGE_GOLD_BONUS}%`
      : "*Fără prestigiu* b�� `/magazin → Prestigiu`";

  const hasShopUpgrades =
    player.shopAttackCount > 0 ||
    player.shopDefenseCount > 0 ||
    player.shopDodgeCount > 0 ||
    player.shopCritCount > 0 ||
    player.shopHpCount > 0;
  const shopStatsValue = hasShopUpgrades
    ? `⚔️ +${player.attackBonus} daune (${player.shopAttackCount}×) · 🛡️ -${player.defenseBonus} daune primite (${player.shopDefenseCount}×)\n` +
      `🌀 ${player.dodgeBonus}% evitare (${player.shopDodgeCount}×) · 💥 ${player.critBonus}% critic (${player.shopCritCount}×) · ❤️ +${player.maxHpBonus} HP (${player.shopHpCount}×)`
    : "*Fără upgrade-uri de putere* — `/magazin → Puteri`";

  const visibleItems = items.filter((i) => i.quantity > 0);
  const inventoryValue =
    visibleItems.length > 0
      ? visibleItems
          .map(
            (i) =>
              `${isItemKey(i.itemKey) ? ITEMS[i.itemKey].emoji : "❓"} **×${i.quantity}** ${isItemKey(i.itemKey) ? ITEMS[i.itemKey].label : i.itemKey}`,
          )
          .join("  ·  ")
      : "*Inventar gol — ucide monștri pentru iteme!*";

  const oracleTitle = player.oracleTitle ?? "Suflet necunoscut";
  const oracleBond = player.oracleBond ?? 0;
  const rememberedMoments = Array.isArray(player.oracleMemory) ? player.oracleMemory.length : 0;
  const oracleRelationValue =
    `🔮 **${oracleTitle}**\n` +
    `Legătură cu Oracolul: **${oracleBond >= 0 ? "+" : ""}${oracleBond}** · ` +
    `Întâlniri: **${player.oracleInteractions ?? 0}** · Amintiri: **${rememberedMoments}**`;

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(title ?? `📜 Profilul lui ${player.username}`)
    .setDescription(
      `🎖️ **${rank}** *(Nivel max: ${player.maxLevel})*` +
        (player.honorTitle ? `\n👑 **${player.honorTitle}**` : "") +
        (player.discordId === SUPER_ADMIN_ID
          ? "\n🧙‍♂️ **Fondatorul Regatului Cenușii**"
          : ""),
    )
    .addFields(
      { name: "🧬 Clasă", value: classValue, inline: true },
      { name: "🐾 Companion", value: compValue, inline: true },
      { name: "🔮 Talisman", value: talismanValue, inline: true },
      { name: "⚒️ Echipament", value: equipmentValue, inline: true },
      { name: "━━━ Legătura cu Oracolul ━━━", value: oracleRelationValue, inline: false },
      {
        name: "━━━ Statistici de luptă ━━━",
        value: combatStatsValue(player),
        inline: false,
      },
      { name: "⚡ Puteri de clasă", value: abilValue, inline: false },
      { name: "━━━ Prestigiu ━━━", value: prestigeValue, inline: false },
      {
        name: "━━━ Puteri din Magazin ━━━",
        value: shopStatsValue,
        inline: false,
      },
      {
        name: "━━━ Resurse ━━━",
        value: `⭐ **${player.xp}** XP   ·   🪙 **${player.gold}** Oboli   ·   🏅 **${player.reputation}** Reputație\n🔷 Mana: **${player.mana ?? MANA_BASE}/${maxMana(player.manaLevel ?? 0)}** Nv.${player.manaLevel ?? 0} ${manaBar(player.mana ?? MANA_BASE, maxMana(player.manaLevel ?? 0))}`,
        inline: false,
      },
      { name: "━━━ Chei ━━━", value: keysValue, inline: false },
      {
        name: "🎲 Norocul Cufere­lor",
        value: `Pity: **${player.chestPity ?? 0}/5** ${buildProgressBar(player.chestPity ?? 0, 5, 5)}\nLa al cincilea cufăr obișnuit: fragment de relicvă + binecuvântare garantate.`,
        inline: false,
      },
      { name: "━━━ Inventar ━━━", value: inventoryValue, inline: false },
      {
        name: "━━━ Istoric de luptă ━━━",
        value: `💀 Morți: **${deathInfo}**\n🏳️ Retrageri: **${retreatInfo}**`,
        inline: false,
      },
    )
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
  const effects = formatActiveEffects(player.discordId);
  if (effects)
    embed.addFields({
      name: "━━━ Binecuvântări & Blesteme ━━━",
      value: effects,
      inline: false,
    });
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  if (classImage) embed.setImage(classImage);
  return embed;
}

export interface ChestRarity {
  key: string;
  label: string;
  tierLabel?: string;
  emoji: string;
  color: number;
  min: number;
  max: number;
  weight: number;
}

export type ChestVariant = "aur" | "razboi" | "blestemat" | "oracolului" | "umbrelor" | "fratie";

export const CHEST_VARIANTS: Record<ChestVariant, {
  label: string;
  emoji: string;
  description: string;
}> = {
  aur: { label: "Sigiliul Aurit", emoji: "🥇", description: "Obolii se înmulțesc sub atingerea ta." },
  razboi: { label: "Sigiliul Războiului", emoji: "⚔️", description: "Pradă pentru cei care își ascut lama și răbdarea." },
  blestemat: { label: "Sigiliul Blestemat", emoji: "☠️", description: "Comoară mare, dar cenușa dinăuntru mușcă." },
  oracolului: { label: "Sigiliul Oracolului", emoji: "🔮", description: "Înăuntru doarme un răspuns pe care nu l-ai întrebat încă." },
  umbrelor: { label: "Sigiliul Umbrelor", emoji: "🌑", description: "Fragmentele relicvelor se adună în întuneric." },
  fratie: { label: "Sigiliul Frăției", emoji: "🤝", description: "Ridicat prin glasurile și pașii întregului server." },
};

/** Flavor roll for the six Cufere 2.0. Rarity still controls economy. */
export function rollChestVariant(serverChest = false): ChestVariant {
  if (serverChest) return "fratie";
  const roll = Math.random();
  if (roll < 0.18) return "razboi";
  if (roll < 0.34) return "blestemat";
  if (roll < 0.50) return "oracolului";
  if (roll < 0.70) return "umbrelor";
  if (roll < 0.84) return "fratie";
  return "aur";
}

export const CHEST_RARITIES: ChestRarity[] = [
  {
    key: "bronz",
    label: "Cufărul Stins",
    tierLabel: "Comun",
    emoji: "🪵",
    color: 0x51413b,
    min: 10,
    max: 40,
    weight: 58,
  },
  {
    key: "argint",
    label: "Cufărul Cenușii",
    tierLabel: "Neobișnuit",
    emoji: "⚙️",
    color: 0x8b8b86,
    min: 40,
    max: 90,
    weight: 28,
  },
  {
    key: "aur",
    label: "Cufărul Nocturn",
    tierLabel: "Epic",
    emoji: "🌑",
    color: 0x6f42c1,
    min: 90,
    max: 180,
    weight: 10,
  },
  {
    key: "mitic",
    label: "Cufărul Oaselor",
    tierLabel: "Mistic",
    emoji: "💀",
    color: 0xd8d0b8,
    min: 180,
    max: 350,
    weight: 3,
  },
  {
    key: "regal",
    label: "Cufărul Fumului",
    tierLabel: "Legendar",
    emoji: "🌀",
    color: 0x6f8fa6,
    min: 600,
    max: 1500,
    weight: 0,
  },
  {
    key: "cavaler",
    label: "Cufărul Cavalerului",
    tierLabel: "Mitic / Ultra-Rare",
    emoji: "🛡️",
    color: 0xe7e7e0,
    min: 1800,
    max: 4000,
    weight: 1,
  },
];

// ─── Key chain system ─────────────────────────────────────────────────────────
// Which key type does each chest rarity drop (and at what chance)?
export const KEY_DROP: Record<
  string,
  { keyType: string; chance: number } | null
> = {
  bronz: { keyType: "rar", chance: 0.4 },
  argint: { keyType: "epic", chance: 0.3 },
  aur: { keyType: "regal", chance: 0.2 },
  mitic: { keyType: "oase", chance: 0.12 },
  regal: { keyType: "fum", chance: 0.08 },
  cavaler: { keyType: "cavaler", chance: 0.04 },
};

// Which key type is required to open a locked chest of each rarity?
export const CHEST_KEY_REQUIRED: Record<string, string> = {
  argint: "rar",
  aur: "epic",
  mitic: "regal",
  regal: "oase",
  cavaler: "fum",
};

export const KEY_LABEL: Record<string, string> = {
  rar: "Cheia Umbrei Frânte",
  epic: "Cheia Cenușii Regale",
  regal: "Cheia Nocturnă",
  oase: "Cheia Oaselor Tăcute",
  fum: "Cheia Fumului Înghețat",
  cavaler: "Cheia Cavalerului Cenușiu",
  pangarita: "Cheia Pângărită",
};

// Human-readable name for the source chest that drops each key
export const KEY_SOURCE_LABEL: Record<string, string> = {
  rar: "Cuferele Stinse",
  epic: "Cuferele Cenușii",
  regal: "Cuferele Nocturne",
  oase: "Cuferele Oaselor",
  fum: "Cuferele Fumului",
  cavaler: "Cuferele Cavalerului",
};

// Target locked chest name for each key type
export const KEY_TARGET_LABEL: Record<string, string> = {
  rar: "Cufărul Cenușii",
  epic: "Cufărul Nocturn",
  regal: "Cufărul Oaselor",
  oase: "Cufărul Fumului",
  fum: "Cufărul Cavalerului",
  cavaler: "Cufărul Cavalerului",
};

// Accent emoji per key type (used in messages + profile)
export const KEY_EMOJI: Record<string, string> = {
  rar: "🗝️",
  epic: "🜲",
  regal: "🌙",
  oase: "🦴",
  fum: "❄️",
  cavaler: "⚔️",
  pangarita: "☠️",
};

// Color per key type (silver / gold / royal blue)
export const KEY_COLOR: Record<string, number> = {
  rar: 0x292929,
  epic: 0x858585,
  regal: 0x7b3fb5,
  oase: 0xd8d0b8,
  fum: 0x7295ad,
  cavaler: 0xe7e7e0,
};

// ─── Dedicated key chests ───────────────────────────────────────────────────
// Standalone chests whose reward IS a key (separate from the gold chests).
// Lower tiers are common, the Regal key is a rare prize.
export const KEY_CHEST_WEIGHTS: Array<{ keyType: string; weight: number }> = [
  { keyType: "rar", weight: 40 },
  { keyType: "epic", weight: 25 },
  { keyType: "regal", weight: 15 },
  { keyType: "oase", weight: 10 },
  { keyType: "fum", weight: 7 },
  { keyType: "cavaler", weight: 3 },
];

/** Pick a key type for a random key-chest spawn (weighted toward lower tiers). */
export function rollKeyChestType(): string {
  const total = KEY_CHEST_WEIGHTS.reduce((s, k) => s + k.weight, 0);
  let roll = Math.random() * total;
  for (const k of KEY_CHEST_WEIGHTS) {
    if (roll < k.weight) return k.keyType;
    roll -= k.weight;
  }
  return "rar";
}

// ─── Locked-chest jackpot economy ───────────────────────────────────────────
// Locked chests cost a key to open, so they pay much MORE Oboli than the
// matching free chest — the Regal one is a true jackpot.
export const LOCKED_CHEST_GOLD: Record<string, { min: number; max: number }> = {
  argint: { min: 150, max: 350 },
  aur: { min: 400, max: 800 },
  mitic: { min: 900, max: 1800 },
  regal: { min: 2000, max: 5000 },
  cavaler: { min: 7000, max: 15000 },
};

/** Roll the Oboli payout for a locked chest of a given rarity (boosted ranges). */
export function spawnLockedChest(
  rarityKey: string,
): { rarity: ChestRarity; gold: number } | null {
  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  if (!rarity) return null;
  const range = LOCKED_CHEST_GOLD[rarityKey] ?? {
    min: rarity.min * 2,
    max: rarity.max * 2,
  };
  const gold =
    Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  return { rarity, gold };
}

// ─── Event key drops ────────────────────────────────────────────────────────
// During events, fighters can randomly find keys. Each gets a chance to drop
// a single weighted key.
const EVENT_KEY_DROP_CHANCE = 0.35;

/** Roll key drops for a set of event participants → map of who found which key. */
export function rollEventKeyDrops(discordIds: string[]): Map<string, string> {
  const drops = new Map<string, string>();
  for (const id of discordIds) {
    if (Math.random() < EVENT_KEY_DROP_CHANCE) {
      drops.set(id, rollKeyChestType());
    }
  }
  return drops;
}

export function rollChest(): { rarity: ChestRarity; gold: number } {
  const total = CHEST_RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  let rarity = CHEST_RARITIES[0]!;
  for (const r of CHEST_RARITIES) {
    if (roll < r.weight) {
      rarity = r;
      break;
    }
    roll -= r.weight;
  }
  const gold =
    Math.floor(Math.random() * (rarity.max - rarity.min + 1)) + rarity.min;
  return { rarity, gold };
}

/** Spawn a chest of a specific rarity (admin override). */
export function spawnChest(
  rarityKey: string,
): { rarity: ChestRarity; gold: number } | null {
  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  if (!rarity) return null;
  const gold =
    Math.floor(Math.random() * (rarity.max - rarity.min + 1)) + rarity.min;
  return { rarity, gold };
}

export type ChestChoice = "gold" | "xp" | "blessing" | "relic";

/** The reward paths shown before a chest is claimed. Keeping these in the
 * embed makes the choice meaningful without storing a fragile in-memory state. */
export function chestChoices(rarityKey: string): ChestChoice[] {
  if (rarityKey === "bronz") return ["gold", "xp"];
  if (rarityKey === "argint") return ["gold", "xp", "blessing"];
  return ["gold", "blessing", "relic"];
}

export function buildChestClaimRow(
  chestId: string,
  rarity: ChestRarity,
  gold: number,
  forcedMult?: 2 | 3,
): ActionRowBuilder<ButtonBuilder> {
  const labels: Record<ChestChoice, { label: string; emoji: string; style: ButtonStyle }> = {
    gold: {
      label: `Aur${forcedMult ? ` ×${forcedMult}` : ` (${gold})`}`,
      emoji: "💰",
      style: ButtonStyle.Success,
    },
    xp: { label: "Experiență", emoji: "✨", style: ButtonStyle.Primary },
    blessing: { label: "Binecuvântare", emoji: "🕯️", style: ButtonStyle.Secondary },
    relic: { label: "Fragment relicvă", emoji: "💎", style: ButtonStyle.Primary },
  };
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...chestChoices(rarity.key).map((choice) => {
      const config = labels[choice];
      return new ButtonBuilder()
        .setCustomId(`${chestId}_${choice}`)
        .setLabel(config.label)
        .setEmoji(config.emoji)
        .setStyle(config.style);
    }),
  );
}

export function buildChestEmbed(
  gold: number,
  rarity?: ChestRarity,
  forcedMult?: 2 | 3,
  variant: ChestVariant = "aur",
  expiresAt?: number,
): EmbedBuilder {
  const r = rarity ?? CHEST_RARITIES[0]!;
  const flavor = CHEST_VARIANTS[variant] ?? CHEST_VARIANTS.aur;
  const image = CHEST_IMG[r.key] ?? IMG.chest;
  const bonusLine =
    forcedMult != null
      ? `\n🔮 **Cufăr binecuvântat — ×${forcedMult} Oboli garantat!** Câștigă **${gold * forcedMult}** Oboli!`
      : `\n🎲 **Norocul Cenușii:** la deschidere Obolii pot fi înmulțiți **×1, ×2 sau ×3** — nimeni nu știe până nu apeși!`;
  const keyDrop = KEY_DROP[r.key];
  const keyHintLine = keyDrop
    ? `\n🗝️ *Poate ascunde o ${KEY_LABEL[keyDrop.keyType]}...*`
    : "";
  const effectHintLine =
    "\n🔮 *Se zvonește că unele cufere ascund o **binecuvântare**… sau un **blestem**!*";
  const timerLine = expiresAt
    ? `\n⏳ Cufărul dispare <t:${Math.floor(expiresAt / 1000)}:R>.`
    : "";
  return new EmbedBuilder()
    .setColor(r.color)
    .setTitle(
      `${flavor.emoji}${r.emoji}✨  ${flavor.label.toUpperCase()} — ${r.label.toUpperCase()}  ✨${r.emoji}${flavor.emoji}`,
    )
    .setDescription(
       `Cenușa s-a ridicat și a dezvăluit un cufăr misterios!\n🏷️ **Raritate: ${r.tierLabel ?? "Necunoscută"}**\n*${flavor.description}*\n` +
        "Obolii zac în el, așteptând mâna celui mai rapid.\n\n" +
         `💰 **${gold} Oboli** pentru primul care revendică!${bonusLine}${keyHintLine}${effectHintLine}\n` +
         `🎭 **Alege-ți calea:** aur, experiență${r.key === "bronz" ? "" : ", binecuvântare"}${r.key === "bronz" || r.key === "argint" ? "" : " sau fragment de relicvă"}.\n\n` +
         `⚡ Fii primul — cufărul dispare în fumul umbrelor!${timerLine}`,
    )
    .setImage(image)
    .setFooter({ text: expiresAt ? "Primul click câștigă • timer live în Discord" : "Primul click câștigă!" });
}

/**
 * Surprise reward multiplier rolled at claim time, not at spawn. Most chests
 * give ×1 (no bonus); ×2 is uncommon and ×3 is rare — the gamble at open is
 * the whole point. Used only when the chest has no admin-forced multiplier.
 */
export function rollChestMultiplier(): 1 | 2 | 3 {
  const roll = Math.random();
  if (roll < 0.08) return 3; // 8%
  if (roll < 0.3) return 2; // 22%
  return 1; // 70%
}

export function buildExpiredChestEmbed(
  gold: number,
  rarity?: ChestRarity,
  forcedMult?: 2 | 3,
): EmbedBuilder {
  const r = rarity ?? CHEST_RARITIES[0]!;
  const image = CHEST_IMG[r.key] ?? IMG.chest;
  if (forcedMult != null) {
    return new EmbedBuilder()
      .setColor(0x555555)
      .setTitle(`💨  ${r.label.toUpperCase()} — NERECLAMAT  💨`)
      .setDescription(
        `Cufărul binecuvântat a dispărut nereclamat în fumul umbrelor.\n\n` +
          `💰 ~~${gold} Oboli~~\n` +
          `🔮 ~~Cufăr binecuvântat — ×${forcedMult} Oboli~~ *(bonus pierdut)*\n\n` +
          `*Nimeni nu a fost destul de rapid de data aceasta…*`,
      )
      .setImage(image)
      .setFooter({ text: "Cufărul a dispărut." });
  }
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle(`💨  ${r.label.toUpperCase()} — DISPĂRUT  💨`)
    .setDescription(
      `Cufărul a dispărut în fumul umbrelor, nereclamat.\n\n` +
        `💰 ~~${gold} Oboli~~\n\n` +
        `*Nimeni nu a fost destul de rapid de data aceasta…*`,
    )
    .setImage(image)
    .setFooter({ text: "Cufărul a dispărut." });
}

export function buildLockedChestEmbed(
  rarityKey: string,
  gold: number,
  expiresAt?: number,
): EmbedBuilder {
  const rarity =
    CHEST_RARITIES.find((r) => r.key === rarityKey) ?? CHEST_RARITIES[0]!;
  const keyType = CHEST_KEY_REQUIRED[rarityKey] ?? "rar";
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const sourceLabel = KEY_SOURCE_LABEL[keyType] ?? "cufere comune";
  const chestImage = CHEST_IMG[rarityKey] ?? IMG.chest;
  const keyImage = KEY_IMG[keyType];

  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const isRegal = rarityKey === "regal";
  const jackpotLine = isRegal
    ? "\n\n👑 *Comoara coroanei — cea mai bogată pradă din tot Regatul!*"
    : "";
  const blessingLine = isRegal
    ? "\n✨ **Binecuvântare garantată** la deschidere — fără blesteme!"
    : "\n✨ *Poate ascunde o **binecuvântare** — cuferele blocate nu blestemă niciodată!*";
  const timerLine = expiresAt
    ? `\n⏳ Cufărul dispare <t:${Math.floor(expiresAt / 1000)}:R>.`
    : "";

  return new EmbedBuilder()
    .setColor(rarity.color)
    .setTitle(
      `🔒 ${rarity.emoji}  ${rarity.label.toUpperCase()} — ${rarity.tierLabel ?? "RARITATE NECUNOSCUTĂ"} — BLOCAT  ${rarity.emoji} 🔒`,
    )
    .setDescription(
      `*O forță veche ține cufărul ferecat. Doar ${keyEmoji} **${keyLabel}** îl poate deschide.*\n` +
        `${sectionTitle("Pradă")}\n` +
        `💰 **${gold.toLocaleString()} Oboli** ascunși înăuntru — mult peste un cufăr obișnuit!\n` +
        blessingLine +
        "\n" +
        `${sectionTitle("Cheia")}\n` +
        `${keyEmoji} Necesită: **${keyLabel}**\n` +
        `📜 O găsești în **cufere de chei** sau revendicând **${sourceLabel}**` +
        jackpotLine +
      `\n\n⚡ Un singur jucător poate folosi cheia — fii primul!${timerLine}`,
    )
    .setThumbnail(keyImage)
    .setImage(chestImage)
    .setFooter({ text: expiresAt ? "Cufăr blocat • timer live în Discord" : "Cufăr blocat — expiră în 10 minute" });
}

/** Embed for a key discovery — the prize is a key, not Oboli. */
export function buildKeyChestEmbed(keyType: string): EmbedBuilder {
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  const keyImage = KEY_IMG[keyType];
  const color = KEY_COLOR[keyType] ?? 0xc0c0c0;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${keyEmoji}✨  CHEIE GĂSITĂ!  ✨${keyEmoji}`)
    .setDescription(
      "Cenușa s-a despicat și a scos la iveală o **cheie prețioasă**!\n" +
        `${sectionTitle("Răsplata")}\n` +
        `${keyEmoji} O **${keyLabel}** pentru primul care revendică!\n` +
        `🔓 Deschide cu ea un **${targetLabel}** și ia comoara dinăuntru.\n\n` +
        "⚡ Fii primul — cheia se topește în fumul umbrelor!",
    )
    .setImage(keyImage)
    .setFooter({ text: "Primul click ia cheia!" });
}

/** Message shown when a player claims a key chest. */
export function buildKeyChestClaimMessage(
  username: string,
  keyType: string,
): string {
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const keyEmoji = KEY_EMOJI[keyType] ?? "🗝️";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  return (
    `${keyEmoji} **${username}** a revendicat **${keyLabel}**!\n` +
    `Păstreaz-o pentru a deschide un **${targetLabel}**.`
  );
}

export function buildKeyDropMessage(
  fromRarityKey: string,
  keyType: string,
): string {
  const rarity = CHEST_RARITIES.find((r) => r.key === fromRarityKey);
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie Misterioasă";
  const targetLabel = KEY_TARGET_LABEL[keyType] ?? "cufăr blocat";
  const emoji = rarity?.emoji ?? "📦";
  return (
    `🗝️ **${emoji} ${rarity?.label ?? fromRarityKey}** a dezvăluit o **${keyLabel}**!\n` +
    `Folosește-o pentru a deschide un **${targetLabel}**!`
  );
}

export type ShopCategory =
  | "overview"
  | "stats"
  | "comp"
  | "abil"
  | "prestige"
  | "class"
  | "talisman"
  | "equipment";

const SHOP_BALANCE = (p: Player) => {
  const prestigeLine =
    p.prestigeLevel > 0 ? `   ·   ⭐ Prestigiu **${p.prestigeLevel}**` : "";
  return `🪙 **Oboli: ${p.gold.toLocaleString("ro-RO")}**   ·   ⭐ **XP: ${p.xp.toLocaleString("ro-RO")}**${prestigeLine}`;
};

function resourceLine(
  emoji: string,
  label: string,
  have: number,
  required: number,
): string {
  const enough = have >= required;
  return `${enough ? "✅" : "❌"} ${emoji} ${label}: **${have.toLocaleString("ro-RO")} / ${required.toLocaleString("ro-RO")}**`;
}

function itemInventory(items: PlayerItem[]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.itemKey, item.quantity]));
}

function itemRequirementLines(
  items: PlayerItem[],
  requirements: { item: ItemKey; qty: number }[],
): string {
  const inv = itemInventory(items);
  return requirements
    .map((req) => {
      const item = ITEMS[req.item];
      return resourceLine(
        item.emoji,
        item.label,
        inv[req.item] ?? 0,
        req.qty,
      );
    })
    .join("\n");
}

function upgradeResourceLines(
  p: Player,
  items: PlayerItem[],
  cost: {
    gold?: number;
    xp?: number;
    items?: { item: ItemKey; qty: number }[];
  },
): string {
  const lines: string[] = [];
  if (cost.gold) lines.push(resourceLine("🪙", "Oboli", p.gold, cost.gold));
  if (cost.xp) lines.push(resourceLine("⭐", "XP", p.xp, cost.xp));
  if (cost.items?.length) lines.push(itemRequirementLines(items, cost.items));
  return lines.join("\n");
}

// Five permanent stat upgrades — shows current bonus → value after purchase,
// with the price in bold so the cost is unmistakable.
export const STAT_BAR_MAX = 20;
export const STAT_RANK_MAX = 100;

/** Purely visual rank system: every STAT_BAR_MAX purchases = +1 rank (cap 100).
 *  Nothing is reset — the purchase count and all bonuses keep accumulating;
 *  the bar simply shows progress inside the current rank. */
export function statRankInfo(count: number): { rank: number; inRank: number } {
  const rank = Math.min(STAT_RANK_MAX, Math.floor(count / STAT_BAR_MAX));
  const inRank = rank >= STAT_RANK_MAX ? STAT_BAR_MAX : count % STAT_BAR_MAX;
  return { rank, inRank };
}

/** Rank-style bar line for uncapped upgrade levels (companion, abilities, prestige). */
function rankBarLine(level: number): string {
  const { rank, inRank } = statRankInfo(level);
  const bar = buildProgressBar(inRank, STAT_BAR_MAX, 10);
  return rank > 0 ? `${bar} 🏅 **Rank ${rank}**` : bar;
}

function shopStatsText(p: Player, items: PlayerItem[] = []): string {
  const line = (
    key: ShopKey,
    emoji: string,
    label: string,
    now: string,
    next: string,
  ) => {
    const count = p[SHOP_COUNT_KEY[key]] as number;
    const price = shopPrice(key, count);
    const { rank, inRank } = statRankInfo(count);
    const bar = buildProgressBar(inRank, STAT_BAR_MAX, 10);
    const rankStr = rank > 0 ? ` · 🏅 **Rank ${rank}**` : "";
    return `${emoji} **${label}** (Nv.${inRank}/${STAT_BAR_MAX})${rankStr}\n${bar}\n   ↳ acum ${now} → ${next}\n   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, { gold: price })}\n`;
  };
  return (
    line(
      "atac",
      "⚔️",
      "Atac",
      `+${p.attackBonus} daune`,
      `+${p.attackBonus + 2} daune`,
    ) +
    line(
      "def",
      "🛡️",
      "Apărare",
      `-${p.defenseBonus} daune primite`,
      `-${p.defenseBonus + 2} daune primite`,
    ) +
    line("dodge", "🌀", "Evitare", `${p.dodgeBonus}%`, `${p.dodgeBonus + 3}%`) +
    line("crit", "💥", "Critic", `${p.critBonus}%`, `${p.critBonus + 2}%`) +
    line(
      "hp",
      "❤️",
      "HP maxim",
      `+${p.maxHpBonus} HP`,
      `+${p.maxHpBonus + 10} HP`,
    )
  );
}

function shopCompText(p: Player, items: PlayerItem[] = []): string {
  if (p.companion && isCompanionKey(p.companion)) {
    const c = COMPANIONS[p.companion];
    const evolved = isCompanionEvolved(p.companionLevel);
    const cost = upgradeCost(p.companionLevel);
    return (
      `${c.emoji} **${evolved ? c.evoLabel : c.label}** Nv.${p.companionLevel}${evolved ? " ✨" : ""}\n` +
      `${rankBarLine(p.companionLevel)}\n` +
      `🎁 Bonus activ: **${companionEffectiveDesc(p.companion, p.companionLevel)}**\n\n` +
      `🔼 **Îmbunătățire Nv.${p.companionLevel} → ${p.companionLevel + 1}**\n` +
      `   ↳ bonus nou: **${companionEffectiveDesc(p.companion, p.companionLevel + 1)}**\n` +
       `   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, { gold: cost, xp: UPGRADE_XP_COST })}\n` +
      (evolved
        ? ""
        : `   ↳ evoluează la Nv.${COMPANION_EVOLVE_LEVEL} în forma legendară\n`)
    );
  }
  return (
       `🛒 **Resurse pentru cumpărare:**\n${upgradeResourceLines(p, items, { gold: COMPANION_BUY_COST })}\n\n` +
    Object.values(COMPANIONS)
      .map((c) => `${c.emoji} **${c.label}** — ${c.desc}`)
      .join("\n") +
    `\n\n✨ La Nv.${COMPANION_EVOLVE_LEVEL} companionul evoluează în forma legendară.`
  );
}

function shopAbilText(p: Player, items: PlayerItem[] = []): string {
  const classKey = p.class && isClassKey(p.class) ? p.class : null;
  if (!classKey) {
    return "🧬 Alege mai întâi o clasă din **Clasă** pentru a vedea și cumpăra puterile ei.";
  }
  const powers = CLASS_POWERS[classKey];
  const line = (slot: ClassPowerSlot) => {
    const power = powers[slot];
    const lvl = classPowerLevel(p, classKey, slot);
    if (lvl >= 1) {
      const cost = upgradeCost(lvl);
      return (
        `${power.emoji} **${power.label}** Nv.${lvl}\n` +
        `${rankBarLine(lvl)}\n` +
        `   📖 ${power.description}\n` +
        `   🎁 Efect activ: **${classPowerEffectiveDesc(power, lvl)}**\n` +
        `   🔼 Îmbunătățire → Nv.${lvl + 1}: **${classPowerEffectiveDesc(power, lvl + 1)}**\n` +
         `   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, { gold: cost, xp: UPGRADE_XP_COST })}\n`
      );
    }
    return (
      `${power.emoji} 🔒 **${power.label}**\n` +
      `   📖 ${power.description}\n` +
      `   ↳ la Nv.1: **${classPowerEffectiveDesc(power, 1)}**\n` +
       `   🛒 **Resurse pentru deblocare:**\n${upgradeResourceLines(p, items, { gold: ABILITY_BUY_COST })}\n`
    );
  };
  const mLvl = p.manaLevel ?? 0;
  const mMax = maxMana(mLvl);
  const mCost = manaUpgradeCost(mLvl);
  const rLvl = p.manaRegenLevel ?? 0;
  const rCost = manaRegenUpgradeCost(rLvl);
  const manaSection =
    `\n🔷 **Rezerva de Mană** Nv.${mLvl} *(nivel infinit)*\n` +
    `${rankBarLine(mLvl)}\n` +
    `   ${manaBar(p.mana ?? MANA_BASE, mMax)} **${p.mana ?? MANA_BASE}/${mMax}**\n` +
    `   ↳ Puterile clasei consumă mană; fiecare atac normal reface **${manaRegenPct(rLvl)}%** din maxim.\n` +
    `   🔼 Îmbunătățire → Nv.${mLvl + 1}: **${maxMana(mLvl + 1)} mană maximă**\n` +
    `   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, { gold: mCost, xp: UPGRADE_XP_COST })}\n` +
    `\n💠 **Regenerare de Mană** Nv.${rLvl} *(nivel infinit)*\n` +
    `${rankBarLine(rLvl)}\n` +
    `   ↳ Fiecare atac normal reface **${manaRegenPct(rLvl)}%** din mana maximă.\n` +
    `   🔼 Îmbunătățire → Nv.${rLvl + 1}: **${manaRegenPct(rLvl + 1)}% pe atac**\n` +
    `   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, { gold: rCost, xp: UPGRADE_XP_COST })}\n`;
  return (
    `🧬 **${CLASSES[classKey].label}** — aceste puteri aparțin doar clasei tale.\n\n` +
    line("power1") + "\n" + line("power2") + manaSection
  );
}

// Category-aware shop: each sub-page renders ONLY its own category so the embed
// matches the buttons shown below it. Prices are always bold for clarity.
export function buildShopEmbed(
  p: Player,
  category: ShopCategory = "overview",
  items: PlayerItem[] = [],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setFooter({ text: BRAND_FOOTER })
    .setThumbnail(IMG.shop);

  if (category === "stats") {
    return embed
      .setTitle("⚔️ Forja Cenușii — Puteri")
      .setDescription(
        SHOP_BALANCE(p) +
          "\n\n" +
          sectionTitle("Statistici permanente") +
          "\n" +
          "*Efect imediat, chiar și în lupta curentă.*\n\n" +
           shopStatsText(p, items) +
          "\n*Prețul fiecărei puteri crește cu 35% după fiecare cumpărare.*",
      );
  }

  if (category === "comp") {
    return embed
      .setTitle("🐾 Forja Cenușii — Companion")
      .setDescription(
        SHOP_BALANCE(p) +
          "\n\n" +
          sectionTitle("Companionul tău") +
          "\n" +
           shopCompText(p, items) +
          "\n*Companionul nou se aplică din următoarea Ora Umbrelor.*" +
          (p.companion && isCompanionKey(p.companion)
            ? "\n🔄 *Poți elibera companionul cu butonul de mai jos — nivelul lui se pierde.*"
            : ""),
      );
  }

  if (category === "abil") {
    return embed
      .setTitle("🎯 Forja Cenușii — Puteri")
      .setDescription(
        SHOP_BALANCE(p) +
          "\n\n" +
           sectionTitle("Puteri de clasă") +
          "\n" +
           shopAbilText(p, items) +
           "\n*Puterile se aplică imediat, chiar în lupta curentă.*",
      );
  }

  if (category === "equipment") {
    const equipmentLines = (Object.keys(EQUIPMENT) as EquipmentKey[]).map((key) => {
      const item = EQUIPMENT[key];
      const level = equipmentLevel(p, key);
      const equipped = item.slot === "weapon"
        ? p.equippedWeapon === key
        : p.equippedArmor === key;
      const stats = equipmentStats(key, Math.max(1, level));
      const statLine = [
        stats.attack ? `⚔️ +${stats.attack}` : "",
        stats.defense ? `🛡️ +${stats.defense}` : "",
        stats.dodge ? `🌀 +${stats.dodge}%` : "",
        stats.crit ? `💥 +${stats.crit}%` : "",
        stats.hp ? `❤️ +${stats.hp} HP` : "",
      ].filter(Boolean).join(" · ");
      return `${item.emoji} **${item.label}** ${equipped ? "✅ ECHIPAT" : level ? `Nv.${level}` : "🔒"}\n   ↳ ${statLine}`;
    });
    return embed
      .setTitle("⚒️ Forja Cenușii — Echipament")
      .setDescription(
        SHOP_BALANCE(p) +
          "\n\n" +
          sectionTitle("Arme și armuri") +
          "\nAlege un obiect pentru a vedea imaginea, bonusurile și costul următorului upgrade.\n\n" +
          equipmentLines.join("\n") +
          "\n\n*Fiecare upgrade cere Oboli, XP, resurse vechi și fragmente noi de echipament.*",
      );
  }

  if (category === "class") {
    const clsKey = p.class && isClassKey(p.class) ? p.class : null;
    if (clsKey) {
      const cls = CLASSES[clsKey];
      const level = Math.min(p.classLevel ?? 1, 10);
      const stats = classStats(clsKey, level);
      const next = level < 10 ? classStats(clsKey, level + 1) : null;
      const statLine = (s: {
        attack: number;
        hp: number;
        dodge: number;
        crit: number;
      }) =>
        [
          s.attack > 0 ? `⚔️ +${s.attack} daune` : "",
          s.hp > 0 ? `❤️ +${s.hp} HP` : "",
          s.dodge > 0 ? `🌀 +${s.dodge}% evitare` : "",
          s.crit > 0 ? `💥 +${s.crit}% critic` : "",
          cls.xpMult !== 1 ? `📚 XP ×${cls.xpMult}` : "",
          cls.oboliMult !== 1 ? `💰 Oboli ×${cls.oboliMult}` : "",
        ]
          .filter(Boolean)
          .join(", ");
      const cost = level < 10 ? classUpgradeCost(level) : null;
      const costLines = cost
        ? `   ↳ **Resurse pentru upgrade:**\n${upgradeResourceLines(p, items, cost)}`
        : "";
      return embed
        .setTitle("🧬 Forja Cenușii — Clasă")
        .setDescription(
          SHOP_BALANCE(p) +
            "\n\n" +
            sectionTitle("Calea ta") +
            "\n" +
            `${cls.emoji} **${cls.label}** (Nv.${level}/10)\n` +
            `${buildProgressBar(level, 10, 10)}\n` +
            `> *${cls.desc}*\n\n` +
            `🎁 Bonus activ: **${statLine(stats)}**\n` +
            (next
              ? `🔼 **La Nv.${level + 1} primești:** ${statLine(next)}\n${costLines}\n`
              : "⭐ **Nivel maxim atins!** Calea ta este desăvârșită.\n") +
            "\nBonusurile clasei se aplică automat la fiecare intrare în Ora Umbrelor.\n" +
            `🔄 *Poți schimba calea cu butonul de mai jos — nivelul ei se păstrează, dar instruirea unei noi căi costă **${CLASS_SWITCH_COST} Oboli**.*`,
        );
    }
    const saved = (p.classLevels ?? {}) as Record<string, number>;
    const hasTrained = Object.keys(saved).length > 0;
    return embed.setTitle("🧬 Forja Cenușii — Clasă").setDescription(
      SHOP_BALANCE(p) +
        "\n\n" +
        sectionTitle("Alege-ți calea") +
        "\n" +
        (hasTrained
          ? `🎓 *Instruirea unei noi căi costă **${CLASS_SWITCH_COST} Oboli**. Nivelul fiecărei clase se păstrează.*\n` +
            `${resourceLine("🪙", "Oboli pentru instruire", p.gold, CLASS_SWITCH_COST)}\n\n`
          : "🎓 *Prima instruire este gratuită. Nivelul fiecărei clase se păstrează dacă schimbi calea mai târziu.*\n\n") +
        (Object.keys(CLASSES) as ClassKey[])
          .map((k) => {
            const c = CLASSES[k];
            const lvl = saved[k];
            return `${c.emoji} **${c.label}**${lvl ? ` — 💾 Nv.${lvl} salvat` : ""}\n   ↳ ${c.desc}`;
          })
          .join("\n") +
        "\n\n👇 Apasă butonul clasei dorite pentru a o alege.",
    );
  }

  if (category === "prestige") {
    const cost = prestigeCost(p.prestigeLevel);
    const total = prestigeTotalBonuses(p);
    const next = prestigeNextBonuses(p.prestigeLevel);
    return embed
      .setTitle("💎 Forja Cenușii — Prestigiu")
      .setDescription(
        SHOP_BALANCE(p) +
          "\n\n" +
          sectionTitle("Prestigiu Permanent") +
          "\n" +
          "Fiecare nivel de prestigiu consumă **XP** și oferă bonusuri permanente\n" +
          "care se aplică în **TOATE** luptele normale și în lupta cu Dragonul Stins.\n\n" +
          (p.prestigeLevel > 0
            ? `**🎯 Nivel Prestigiu: ${p.prestigeLevel}**\n${rankBarLine(p.prestigeLevel)}\n${total}\n\n`
            : "") +
          `**🔰 Următorul nivel (${p.prestigeLevel + 1}):**\n` +
          `   → ${next}\n` +
           `   → **Resurse pentru următorul nivel:**\n` +
           `   ${resourceLine("⭐", "XP", p.xp, cost)}\n\n` +
          "*Costul crește cu 50% la fiecare nivel de prestigiu.*",
      );
  }

  return embed
    .setThumbnail(null)
    .setImage(IMG.shop)
    .setTitle("🔥🏺 Forja Cenușii — Magazinul Regal")
    .setDescription(
      "În adâncul cetății, focul nu se stinge niciodată.\n" +
        "Aici puterea se cumpără cu Oboli de Cenușă.\n\n" +
        SHOP_BALANCE(p) +
        "\n\n" +
        sectionTitle("Alege o categorie") +
        "\n" +
        "⚔️ **Puteri** — statistici permanente (atac, apărare, evitare, critic, HP)\n" +
        "🐾 **Companion** — un aliat de luptă care crește odată cu tine\n" +
        "🎯 **Puteri de clasă** — două puteri active, diferite pentru fiecare clasă\n" +
        "🧬 **Clasă** — alege-ți calea și bonusul permanent\n" +
        "⚒️ **Echipament** — arme și armuri cu niveluri și bonusuri proprii\n" +
        "⭐ **Prestigiu** — sacrifică XP pentru putere nemuritoare\n" +
        "🔮 **Talismane** — echipamente cu pasive unice, evoluabile cu iteme rare\n\n" +
        "🗝️ *Caută cuferele de chei — cu ele deschizi cuferele blocate pline de Oboli.*\n\n" +
        "👇 Apasă un buton de mai jos pentru a deschide o categorie.",
    );
}

function equipmentStatsText(key: EquipmentKey, level: number): string {
  const stats = equipmentStats(key, Math.max(1, level));
  return [
    stats.attack ? `⚔️ +${stats.attack} daune` : "",
    stats.defense ? `🛡️ +${stats.defense} apărare` : "",
    stats.dodge ? `🌀 +${stats.dodge}% evitare` : "",
    stats.crit ? `💥 +${stats.crit}% critic` : "",
    stats.hp ? `❤️ +${stats.hp} HP` : "",
  ].filter(Boolean).join(" · ");
}

export function buildEquipmentDetailEmbed(
  p: Player,
  key: EquipmentKey,
  items: PlayerItem[] = [],
): EmbedBuilder {
  const item = EQUIPMENT[key];
  const level = equipmentLevel(p, key);
  const nextCost = equipmentCost(key, level + 1);
  const inv = Object.fromEntries(items.map((entry) => [entry.itemKey, entry.quantity]));
  const requirements = nextCost.items.map((req) => {
    const have = inv[req.item] ?? 0;
    return `${have >= req.qty ? "✅" : "❌"} ${req.qty}× ${ITEMS[req.item].emoji} ${ITEMS[req.item].label} (${have}/${req.qty})`;
  }).join("\n");
  const equipped = item.slot === "weapon" ? p.equippedWeapon === key : p.equippedArmor === key;
  const status = level > 0
    ? `${equipped ? "✅ ECHIPAT" : "📦 DEȚINUT"} · Nivel ${level}`
    : "🔒 NEDEBLOCAT";
  const description =
    `${item.description}\n\n` +
    `**${status}**\n` +
    `📈 Bonus actual: **${level > 0 ? equipmentStatsText(key, level) : "—"}**\n` +
    `🔼 La nivelul ${level + 1}: **${equipmentStatsText(key, level + 1)}**\n\n` +
    `**Cost ${level === 0 ? "de deblocare" : "de upgrade"}:**\n` +
    `🪙 ${nextCost.gold.toLocaleString("ro-RO")} Oboli${nextCost.xp ? `\n✨ ${nextCost.xp} XP` : ""}\n` +
    requirements;
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(`${item.emoji} ${item.label}`)
    .setDescription(description)
    .setFooter({ text: BRAND_FOOTER });
  if (item.image) embed.setImage(item.image);
  return embed;
}

export function buildInventoryEmbeds(player: Player, items: PlayerItem[] = []): EmbedBuilder[] {
  const owned = (Object.keys(EQUIPMENT) as EquipmentKey[])
    .filter((key) => equipmentLevel(player, key) > 0);
  const materials = items
    .filter((item) => item.quantity > 0 && isItemKey(item.itemKey) && !isEquipmentKey(item.itemKey))
    .map((item) => {
      if (!isItemKey(item.itemKey)) return "";
      const material = ITEMS[item.itemKey];
      return `${material.emoji} **×${item.quantity}** ${material.label}`;
    })
    .filter(Boolean)
    .join("  ·  ") || "*Niciun material*";

  if (owned.length === 0) {
    return [new EmbedBuilder()
      .setColor(THEME_COLOR)
      .setTitle(`🎒 Inventarul lui ${player.username}`)
      .setDescription(
        `**Materiale**\n${materials}\n\n` +
        "**Echipament**\n*Nu ai încă arme sau armuri. Învinge monștri pentru loot!*",
      )
      .setFooter({ text: BRAND_FOOTER })];
  }

  return owned.slice(0, 10).map((key, index) => {
    const embed = buildEquipmentDetailEmbed(player, key, items);
    if (index === 0) {
      embed.setDescription(`**Materiale**\n${materials}\n\n${embed.data.description ?? ""}`);
    }
    return embed;
  });
}

export function inventoryRows(player: Player): ActionRowBuilder<ButtonBuilder>[] {
  const owned = (Object.keys(EQUIPMENT) as EquipmentKey[])
    .filter((key) => equipmentLevel(player, key) > 0);
  const buttons = owned.map((key) => {
    const item = EQUIPMENT[key];
    const equipped = item.slot === "weapon"
      ? player.equippedWeapon === key
      : player.equippedArmor === key;
    return new ButtonBuilder()
      .setCustomId(`inventory_equip_${key}`)
      .setLabel(`${equipped ? "✅" : "⚔️"} ${item.label}`.slice(0, 80))
      .setStyle(equipped ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(equipped);
  });
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }
  const upgrades = owned.map((key) => new ButtonBuilder()
    .setCustomId(`inventory_upgrade_${key}`)
    .setLabel(`⬆️ ${EQUIPMENT[key].label} → Nv.${equipmentLevel(player, key) + 1}`.slice(0, 80))
    .setStyle(ButtonStyle.Success));
  for (let i = 0; i < upgrades.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(upgrades.slice(i, i + 5)));
  }
  return rows;
}

export function buildEquipmentLootEmbed(key: EquipmentKey, level = 1): EmbedBuilder {
  const item = EQUIPMENT[key];
  const embed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setTitle(`✨ ${item.slot === "weapon" ? "ARMĂ" : "ARMURĂ"} NOUĂ: ${item.label}`)
    .setDescription(
      `Ai găsit un obiect de echipament de nivel **${level}**!\n\n` +
      `Bonusuri: **${equipmentDesc(key, level)}**\n\n` +
      "Folosește **/inventar** sau **/magazin → Echipament** pentru a-l echipa. Obiectele înlocuite rămân deținute.",
    )
    .setFooter({ text: BRAND_FOOTER });
  if (item.image) embed.setImage(item.image);
  return embed;
}

export function buildLevelupEmbed(
  newLevel: number,
  dropLine?: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`✨  AI AVANSAT LA NIVELUL ${newLevel}  ✨`)
    .setDescription(
      "Cenușa se ridică în jurul tău, iar Umbrele îți recunosc puterea.\n" +
        "Regatul Cenușii îți oferă un dar pentru progresul tău.\n\n" +
        (dropLine ? `${dropLine}\n\n` : "") +
        "**Alege un bonus special:**\n\n" +
        "🔹 **+5 XP bonus** la fiecare monstru ucis\n" +
        "🔹 **+3% șansă de evitare**\n" +
        "🔹 **+2 daune** permanent\n" +
        "🔹 **+5 HP** permanent (și vindecare)\n" +
        "🔹 **+1% șansă critică**\n\n" +
        "Fiecare alegere îți schimbă destinul.\nUmbrele privesc… și judecă.",
    );
}

export function buildExpiredCronica(
  survivors: { username: string; monsterLevel: number }[],
  fallen: { username: string; monsterLevel: number }[],
  fled: { username: string; monsterLevel: number }[] = [],
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];
  const top =
    survivors
      .sort((a, b) => b.monsterLevel - a.monsterLevel)
      .slice(0, 5)
      .map(
        (p, i) =>
          `${medals[i] ?? `**${i + 1}.**`} **${p.username}** — Nivel ${p.monsterLevel}`,
      )
      .join("\n") || "*Nimeni nu a supraviețuit.*";

  const topFallen =
    fallen
      .sort((a, b) => b.monsterLevel - a.monsterLevel)
      .slice(0, 3)
      .map((p) => `💀 **${p.username}** — Căzut la Nivel ${p.monsterLevel}`)
      .join("\n") || "*Nimeni nu a căzut.*";

  const topFled = fled
    .sort((a, b) => b.monsterLevel - a.monsterLevel)
    .slice(0, 3)
    .map(
      (p) =>
        `🏳️ **${p.username}** — A abandonat și a fugit la Nivel ${p.monsterLevel}`,
    )
    .join("\n");

  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🏆📜  CRONICA SUPRAVIEȚUITORILOR  📜🏆")
    .setDescription(
      "Evenimentul s-a încheiat.\nUmbrele se retrag, iar cenușa cade încet peste Regat.\n\n" +
        `**Eroii care au rezistat cel mai mult:**\n${top}\n\n` +
        `**Cei Căzuți în Umbre:**\n${topFallen}\n\n` +
        (topFled
          ? `**Cei care au abandonat și au fugit:**\n${topFled}\n\n`
          : "") +
        "Regatul Cenușii își amintește de fiecare pas,\nde fiecare lovitură și de fiecare cădere.\nUmbrele îți mulțumesc pentru luptă.",
    );
}

export function buildEventLeaderboard(
  participants: Array<{
    username: string;
    discordId: string;
    monsterLevel: number;
    monsterRarity: string;
    totalDamage: number;
    oboli: number;
    isAlive: boolean;
    fled: boolean;
    currentHp: number;
    maxHp: number;
  }>,
): EmbedBuilder {
  const medals = ["🥇", "🥈", "🥉"];

  const ranked = [...participants].sort((a, b) => {
    if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
    if (b.monsterLevel !== a.monsterLevel)
      return b.monsterLevel - a.monsterLevel;
    if (b.totalDamage !== a.totalDamage) return b.totalDamage - a.totalDamage;
    return b.oboli - a.oboli;
  });

  const lines = ranked.slice(0, 10).map((p, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    const rarityEmoji = RARITY[p.monsterRarity as Rarity]?.emoji ?? "👹";

    let status: string;
    if (!p.isAlive && p.fled) {
      status = "🏳️ A fugit";
    } else if (!p.isAlive) {
      status = "💀 Căzut";
    } else {
      status = `❤️ ${p.currentHp}/${p.maxHp} HP`;
    }

    return (
      `${medal} **${p.username}** — ${rarityEmoji} Niv.${p.monsterLevel} | ` +
      `⚔️ ${p.totalDamage.toLocaleString()} daune | 🪙 ${p.oboli} Oboli | ${status}`
    );
  });

  const survivorCount = participants.filter((p) => p.isAlive).length;
  const fallenCount = participants.filter((p) => !p.isAlive && !p.fled).length;
  const fledCount = participants.filter((p) => !p.isAlive && p.fled).length;

  return new EmbedBuilder()
    .setColor(0x8a4a2f)
    .setTitle("🏆 CLASAMENT EVENIMENT — Ora Umbrelor")
    .setDescription(
      `👤 **${participants.length}** participanți | ` +
        `❤️ **${survivorCount}** supraviețuitori | ` +
        `💀 **${fallenCount}** căzuți | ` +
        `🏳️ **${fledCount}** au fugit\n\n` +
        (lines.length > 0 ? lines.join("\n") : "_Niciun participant._"),
    )
    .setFooter({ text: "Clasament generat la finalul evenimentului." })
    .setTimestamp();
}

export function combatRow(
  eventId: number,
  p?: EventParticipant,
): ActionRowBuilder<ButtonBuilder> {
  const hasEmpower = (p?.empowerLevel ?? 0) >= 1;
  const hasShield = (p?.shieldLevel ?? 0) >= 1;
  const power1 = classPowerFor(p?.classKey, "power1");
  const power2 = classPowerFor(p?.classKey, "power2");
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ora_attack_${eventId}`)
      .setLabel("Atacă")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ora_ability_${eventId}_empower`)
      .setLabel(hasEmpower ? (power1?.label ?? "Puterea ofensivă") : `🔒 ${power1?.label ?? "Puterea ofensivă"}`)
      .setEmoji(power1?.emoji ?? "⚔️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasEmpower),
    new ButtonBuilder()
      .setCustomId(`ora_ability_${eventId}_shield`)
      .setLabel(hasShield ? (power2?.label ?? "Puterea defensivă") : `🔒 ${power2?.label ?? "Puterea defensivă"}`)
      .setEmoji(power2?.emoji ?? "🛡️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasShield),
    new ButtonBuilder()
      .setCustomId(`ora_retreat_${eventId}`)
      .setLabel("Retragere")
      .setEmoji("🏳️")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function buildRetreatEmbed(
  level: number,
  opts?: {
    totalDamage?: number;
    oboli?: number;
    xp?: number;
    baseOboli?: number;
    baseXp?: number;
    itemsFarmed?: Record<string, number> | null;
  },
): EmbedBuilder {
  const {
    totalDamage = 0,
    oboli = 0,
    xp = 0,
    baseOboli = 0,
    baseXp = 0,
    itemsFarmed,
  } = opts ?? {};
  const oboliLine = formatEventReward("🪙", "Oboli", oboli, baseOboli);
  const xpLine = formatEventReward("⭐", "XP", xp, baseXp);
  const itemsLine = formatItemsFarmed(itemsFarmed);
  const summary =
    totalDamage > 0 || oboli > 0 || xp > 0 || itemsLine
      ? `\n${sectionTitle("Rezumat Eveniment")}\n⚔️ Daune totale: **${totalDamage.toLocaleString()}**\n${oboliLine}${xpLine}${itemsLine}\n`
      : "";
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle("🏳️  TE-AI RETRAS DIN LUPTĂ 🏳️")
    .setDescription(
      "Ai întors spatele Umbrelor și ai fugit din fața monstrului.\n" +
        `Ai abandonat lupta la **Nivelul ${level}**.\n\n` +
        "🪙 Obolii strânși rămân ai tăi — fuga ți-a salvat câștigul.\n" +
        "Dar Regatul își amintește de cei care au fugit…\n\n" +
        summary +
        "Numele tău va purta pecetea celui care **a abandonat și a fugit**.\n" +
        "Folosește **/magazin** ca să te întărești pentru următoarea chemare.",
    );
}

export const SHOP_COUNT_KEY: Record<ShopKey, keyof Player> = {
  atac: "shopAttackCount",
  def: "shopDefenseCount",
  dodge: "shopDodgeCount",
  crit: "shopCritCount",
  hp: "shopHpCount",
};

// ─── Shop navigation ─────────────────────────────────────────────────────────

/** Main nav row — category buttons shown on the landing page. */
export function shopNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_nav_stats")
      .setLabel("Statistici")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_nav_comp")
      .setLabel("Companion")
      .setEmoji("🐾")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_nav_abil")
      .setLabel("Puteri")
      .setEmoji("🎯")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_nav_class")
      .setLabel("Clasă")
      .setEmoji("🧬")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_nav_prestige")
      .setLabel("Prestigiu")
      .setEmoji("⭐")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Back button row — shown at the bottom of every sub-page. */
export function shopBackRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_back")
      .setLabel("← Înapoi")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Second nav row — Talismane (kept separate because shopNavRow hits Discord's 5-button limit). */
export function shopNavRow2(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_nav_equipment")
      .setLabel("Echipament")
      .setEmoji("⚒️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_nav_talisman")
      .setLabel("Talismane")
      .setEmoji("🔮")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Main page rows (both nav rows). */
export function shopRows(_p: Player): ActionRowBuilder<ButtonBuilder>[] {
  return [shopNavRow(), shopNavRow2()];
}

export function shopEquipmentRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const keys = Object.keys(EQUIPMENT) as EquipmentKey[];
  const makeRow = (slot: EquipmentSlot) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      keys
        .filter((key) => EQUIPMENT[key].slot === slot)
        .map((key) => {
          const item = EQUIPMENT[key];
          const level = equipmentLevel(p, key);
          const equipped = slot === "weapon"
            ? p.equippedWeapon === key
            : p.equippedArmor === key;
          return new ButtonBuilder()
            .setCustomId(`shop_equipment_${key}`)
            .setLabel(`${equipped ? "✅ " : ""}${item.label}${level ? ` Nv.${level}` : ""}`.slice(0, 80))
            .setEmoji(item.emoji)
            .setStyle(equipped ? ButtonStyle.Success : ButtonStyle.Primary);
        }),
    );
  return [makeRow("weapon"), makeRow("armor"), shopBackRow()];
}

export function shopEquipmentDetailRows(
  p: Player,
  key: EquipmentKey,
  items: PlayerItem[] = [],
): ActionRowBuilder<ButtonBuilder>[] {
  const item = EQUIPMENT[key];
  const level = equipmentLevel(p, key);
  const inv = Object.fromEntries(items.map((entry) => [entry.itemKey, entry.quantity]));
  const cost = equipmentCost(key, level + 1);
  const hasItems = cost.items.every((req) => (inv[req.item] ?? 0) >= req.qty);
  const canAfford = p.gold >= cost.gold && p.xp >= cost.xp && hasItems;
  const equipped = item.slot === "weapon" ? p.equippedWeapon === key : p.equippedArmor === key;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_equipment_equip_${key}`)
        .setLabel(equipped ? "✅ Echipat" : level > 0 ? "Echipează" : "Deblochează și echipează")
        .setEmoji("⚔️")
        .setStyle(equipped ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(level === 0 || equipped),
      new ButtonBuilder()
        .setCustomId(`shop_equipment_upgrade_${key}`)
        .setLabel(level === 0 ? `Deblochează (${cost.gold} Oboli)` : `Upgrade la Nv.${level + 1}`)
        .setEmoji("🔼")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canAfford),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shop_nav_equipment")
        .setLabel("← Înapoi la echipament")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function prestigeCost(level: number): number {
  return Math.floor(10_000 * Math.pow(1.5, level));
}

/** Extra gold from monster kills and boss rewards, in % per prestige level. */
export const PRESTIGE_GOLD_BONUS = 5;

/** Gold multiplier from prestige (e.g. level 3 → ×1.15). */
export function prestigeGoldMult(prestigeLevel: number): number {
  return 1 + (Math.max(0, prestigeLevel) * PRESTIGE_GOLD_BONUS) / 100;
}

export function prestigeStartLevel(_prestigeLevel: number): number {
  return 1; // Prestige no longer raises the event start level; bonuses only
}

function prestigeNextBonuses(level: number): string {
  const next = level + 1;
  const mult = Math.pow(1.5, level - 1);
  const atk = Math.round(5 * mult);
  const def = Math.round(5 * mult);
  const dodge = Math.round(3 * mult);
  const crit = Math.round(3 * mult);
  const hp = Math.round(20 * mult);
  return `⚔️ +${atk} daune · 🛡️ +${def} apărare · 🌀 +${dodge}% evitare · 💥 +${crit}% critic · ❤️ +${hp} HP · 🪙 +${PRESTIGE_GOLD_BONUS}% Oboli`;
}

function prestigeTotalBonuses(p: Player): string {
  if (p.prestigeLevel <= 0) return "";
  return (
    `⚔️ +${p.prestigeAttackBonus} daune · 🛡️ +${p.prestigeDefenseBonus} apărare\n` +
    `🌀 +${p.prestigeDodgeBonus}% evitare · 💥 +${p.prestigeCritBonus}% critic · ❤️ +${p.prestigeHpBonus} HP\n` +
    `🪙 +${p.prestigeLevel * PRESTIGE_GOLD_BONUS}% Oboli din monștri și boss`
  );
}

/** Puteri (stat upgrades) sub-page rows. */
export function shopStatsRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const mk = (key: ShopKey, emoji: string, label: string) => {
    const count = p[SHOP_COUNT_KEY[key]] as number;
    const price = shopPrice(key, count);
    return new ButtonBuilder()
      .setCustomId(`shop_buy_${key}`)
      .setLabel(`${label} (${price})`)
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(p.gold < price);
  };
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("atac", "⚔️", "Atac"),
      mk("def", "🛡️", "Apărare"),
      mk("dodge", "🌀", "Evitare"),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      mk("crit", "💥", "Critic"),
      mk("hp", "❤️", "HP maxim"),
    ),
    shopBackRow(),
  ];
}

/** Companion sub-page rows (buy or upgrade). */
export function shopCompRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  if (p.companion && isCompanionKey(p.companion)) {
    const cost = upgradeCost(p.companionLevel);
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_compup")
          .setLabel(
            `Îmbunătățire Nv.${p.companionLevel} → ${p.companionLevel + 1} (${cost} Oboli + ${UPGRADE_XP_COST} XP)`,
          )
          .setEmoji(COMPANIONS[p.companion].emoji)
          .setStyle(ButtonStyle.Success)
          .setDisabled(p.gold < cost || p.xp < UPGRADE_XP_COST),
        new ButtonBuilder()
          .setCustomId("shop_compreset")
          .setLabel("Eliberează companionul")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Danger),
      ),
      shopBackRow(),
    ];
  }
  const keys = Object.keys(COMPANIONS) as CompanionKey[];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      keys.slice(0, 4).map((k) =>
        new ButtonBuilder()
          .setCustomId(`shop_compbuy_${k}`)
          .setLabel(`${COMPANIONS[k].label} (${COMPANION_BUY_COST})`)
          .setEmoji(COMPANIONS[k].emoji)
          .setStyle(ButtonStyle.Success)
          .setDisabled(p.gold < COMPANION_BUY_COST),
      ),
    ),
    shopBackRow(),
  ];
}

/** Puteri de clasă sub-page rows (buy or upgrade each power). */
export function shopAbilRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const classKey = p.class && isClassKey(p.class) ? p.class : null;
  const abilBtn = (slot: ClassPowerSlot) => {
    const power = classPowerFor(classKey, slot);
    if (!power) {
      return new ButtonBuilder()
        .setCustomId(`shop_powerbuy_${slot}`)
        .setLabel("Alege o clasă mai întâi")
        .setEmoji("🧬")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);
    }
    const lvl = classPowerLevel(p, classKey, slot);
    if (lvl >= 1) {
      const cost = upgradeCost(lvl);
      return new ButtonBuilder()
        .setCustomId(`shop_powerup_${slot}`)
        .setLabel(
          `${power.label} Nv.${lvl} → ${lvl + 1} (${cost} + ${UPGRADE_XP_COST}XP)`,
        )
        .setEmoji(power.emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(p.gold < cost || p.xp < UPGRADE_XP_COST);
    }
    return new ButtonBuilder()
      .setCustomId(`shop_powerbuy_${slot}`)
      .setLabel(`🔒 ${power.label} — Deblochează (${ABILITY_BUY_COST} Oboli)`)
      .setEmoji(power.emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(p.gold < ABILITY_BUY_COST);
  };
  const mLvl = p.manaLevel ?? 0;
  const mCost = manaUpgradeCost(mLvl);
  const manaBtn = new ButtonBuilder()
    .setCustomId("shop_manaup")
    .setLabel(
      `Rezerva de Mană Nv.${mLvl} → ${mLvl + 1} (${mCost} + ${UPGRADE_XP_COST}XP)`,
    )
    .setEmoji("🔷")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(p.gold < mCost || p.xp < UPGRADE_XP_COST);
  const rLvl = p.manaRegenLevel ?? 0;
  const rCost = manaRegenUpgradeCost(rLvl);
  const regenBtn = new ButtonBuilder()
    .setCustomId("shop_manaregenup")
    .setLabel(
      `Regenerare de Mană Nv.${rLvl} → ${rLvl + 1} (${rCost} + ${UPGRADE_XP_COST}XP)`,
    )
    .setEmoji("💠")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(p.gold < rCost || p.xp < UPGRADE_XP_COST);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      abilBtn("power1"),
      abilBtn("power2"),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(manaBtn, regenBtn),
    shopBackRow(),
  ];
}

/** Prestige sub-page rows. */
export function shopPrestigeRows(p: Player): ActionRowBuilder<ButtonBuilder>[] {
  const cost = prestigeCost(p.prestigeLevel);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shop_prestigebuy")
        .setLabel(
          `⭐ Prestigiu Nv.${p.prestigeLevel} → ${p.prestigeLevel + 1} (${cost.toLocaleString("ro-RO")} XP)`,
        )
        .setEmoji("💎")
        .setStyle(ButtonStyle.Success)
        .setDisabled(p.xp < cost),
    ),
    shopBackRow(),
  ];
  return rows;
}

/** Class sub-page rows — pickers if unchosen, upgrade button once a class is set. */
export function shopClassRows(
  p: Player,
  items: PlayerItem[] = [],
): ActionRowBuilder<ButtonBuilder>[] {
  if (p.class && isClassKey(p.class)) {
    const level = p.classLevel ?? 1;
    const cost = level < 10 ? classUpgradeCost(level) : null;
    const canAfford = cost
      ? p.gold >= cost.gold &&
        p.xp >= cost.xp &&
        cost.items.every((req) => (itemInventory(items)[req.item] ?? 0) >= req.qty)
      : false;
    const resetBtn = new ButtonBuilder()
      .setCustomId("shop_classreset")
      .setLabel("Renunță la clasă")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Danger);
    if (level >= 10) {
      return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(resetBtn),
        shopBackRow(),
      ];
    }
    const rows: ActionRowBuilder<ButtonBuilder>[] = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_classup")
          .setLabel(
            `\u2b06\ufe0f Upgrade Clas\u0103 Nv.${level} \u2192 ${level + 1}`,
          )
          .setEmoji("💎")
          .setStyle(ButtonStyle.Success)
         .setDisabled(!canAfford),
        resetBtn,
      ),
      shopBackRow(),
    ];
    return rows;
  }
  const keys = Object.keys(CLASSES) as ClassKey[];
  const feeApplies =
    Object.keys((p.classLevels ?? {}) as Record<string, number>).length > 0;
  const btn = (k: ClassKey) =>
    new ButtonBuilder()
      .setCustomId(`shop_class_${k}`)
      .setLabel(
        feeApplies
          ? `${CLASSES[k].label} (${CLASS_SWITCH_COST})`
          : CLASSES[k].label,
      )
      .setEmoji(CLASSES[k].emoji)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(feeApplies && p.gold < CLASS_SWITCH_COST);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      keys.slice(0, 3).map(btn),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(3).map(btn)),
    shopBackRow(),
  ];
}

/** Talisman sub-page embed. `savedLevels` maps talismanKey → saved level for owned talismans. */
export function buildTalismanPage(
  p: Player,
  items: PlayerItem[],
  savedLevels: Record<string, number> = {},
): EmbedBuilder {
  const equippedKey =
    p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const equippedLevel = p.talismanLevel ?? 1;

  const talismanLines = (Object.keys(TALISMANS) as TalismanKey[]).map((key) => {
    const t = TALISMANS[key];
    const isEquipped = equippedKey === key;
    const savedLevel = savedLevels[key] ?? 0;
    const owned = isEquipped || savedLevel > 0;
    const level = isEquipped ? equippedLevel : Math.max(1, savedLevel);
    const levelTag = isEquipped
      ? ` ✅ **ECHIPAT** (Nv.${equippedLevel})`
      : savedLevel > 0
        ? ` 💾 deținut (Nv.${savedLevel})`
        : "";
    const priceTag = owned ? "*deținut*" : `**${t.price} Oboli**`;
    const upgradeInfo = isEquipped
      ? (() => {
          const cost = talismanUpgradeCost(key, equippedLevel);
          const tierPart = cost.tier
            ? ` + ${cost.tierQty}× ${ITEMS[cost.tier].emoji} ${ITEMS[cost.tier].label}`
            : "";
          return `\n   ↳ *Upgrade Nv.${equippedLevel + 1}* → **${talismanDesc(key, equippedLevel + 1)}**\n   ↳ cost: ${cost.commonQty}× ${ITEMS[cost.common].emoji} ${ITEMS[cost.common].label} + ${cost.rareQty}× ${ITEMS[cost.rare].emoji} ${ITEMS[cost.rare].label}${tierPart}`;
        })()
      : "";
    const barLine = owned ? `\n${talismanRankLine(level)} (Nv.${level})` : "";
    return `${t.emoji} **${t.label}**${levelTag} — ${priceTag}${barLine}\n   ↳ ${t.passiveLabel}: ${talismanDesc(key, level)}${upgradeInfo}`;
  });

  const inventoryLine =
    items.filter((i) => i.quantity > 0).length > 0
      ? items
          .filter((i) => i.quantity > 0)
          .map(
            (i) =>
              `${isItemKey(i.itemKey) ? ITEMS[i.itemKey].emoji : "❓"} **×${i.quantity}** ${isItemKey(i.itemKey) ? ITEMS[i.itemKey].label : i.itemKey}`,
          )
          .join("  ·  ")
      : "*Niciun item — ucide monștri și boși!*";

  return new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setFooter({ text: BRAND_FOOTER })
    .setThumbnail(IMG.shop)
    .setTitle("🔮 Forja Cenușii — Talismane")
    .setDescription(
      SHOP_BALANCE(p) +
        "\n\n" +
        sectionTitle("Talismane disponibile") +
        "\n" +
        "*Fiecare talisman oferă un pasiv unic, cu nivele **infinite** — la fiecare 5 nivele urci un 🏅 Rank. Nivelul rămâne salvat când schimbi talismanul, iar cele deținute se echipează gratuit.*\n\n" +
        "*Materiale de rank: 💠 Solz Spectral (monștri rari) · 💎 Cristal de Abis (epici) · 🧪 Sânge de Titan (legendari) · 🌟 Fragment Mitic (mitici) · 🔥 Sigiliul Bossului (mini-bossi).*\n\n" +
        talismanLines.join("\n") +
        "\n\n" +
        sectionTitle("Inventarul tău de materiale") +
        "\n" +
        inventoryLine,
    );
}

/** Talisman sub-page action rows. `savedLevels` maps talismanKey → saved level for owned talismans. */
export function shopTalismanRows(
  p: Player,
  items: PlayerItem[],
  savedLevels: Record<string, number> = {},
): ActionRowBuilder<ButtonBuilder>[] {
  const inv = Object.fromEntries(items.map((i) => [i.itemKey, i.quantity]));
  const equippedKey =
    p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const equippedLevel = p.talismanLevel ?? 1;
  const keys = Object.keys(TALISMANS) as TalismanKey[];

  const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    keys.map((key) => {
      const t = TALISMANS[key];
      const isEquipped = equippedKey === key;
      const savedLevel = savedLevels[key] ?? 0;
      const owned = isEquipped || savedLevel > 0;
      const label = isEquipped
        ? `✅ ${t.label}`
        : owned
          ? `${t.label} (Nv.${savedLevel})`
          : `${t.label} (${t.price})`;
      return new ButtonBuilder()
        .setCustomId(`shop_talisman_${key}`)
        .setLabel(label)
        .setEmoji(t.emoji)
        .setStyle(isEquipped ? ButtonStyle.Success : ButtonStyle.Primary)
        .setDisabled(isEquipped || (!owned && p.gold < t.price));
    }),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [buyRow];

  if (equippedKey) {
    const cost = talismanUpgradeCost(equippedKey, equippedLevel);
    const hasItems =
      (inv[cost.common] ?? 0) >= cost.commonQty &&
      (inv[cost.rare] ?? 0) >= cost.rareQty &&
      (!cost.tier || (inv[cost.tier] ?? 0) >= cost.tierQty);
    const tierPart = cost.tier
      ? ` + ${cost.tierQty}× ${ITEMS[cost.tier].label}`
      : "";
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("shop_talisman_upgrade")
          .setLabel(
            `✨ Evoluează la Nv.${equippedLevel + 1} (${cost.commonQty}× ${ITEMS[cost.common].label} + ${cost.rareQty}× ${ITEMS[cost.rare].label}${tierPart})`.slice(
              0,
              80,
            ),
          )
          .setStyle(ButtonStyle.Success)
          .setDisabled(!hasItems),
      ),
    );
  }

  rows.push(shopBackRow());
  return rows;
}

export function levelupRows(
  eventId: number,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_lvlup_${eventId}_xp`)
        .setLabel("+5 XP/monstru")
        .setEmoji("🔹")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ora_lvlup_${eventId}_dodge`)
        .setLabel("+3% Evitare")
        .setEmoji("🔹")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ora_lvlup_${eventId}_atac`)
        .setLabel("+2 Daune")
        .setEmoji("🔹")
        .setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_lvlup_${eventId}_hp`)
        .setLabel("+5 HP")
        .setEmoji("🔹")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ora_lvlup_${eventId}_crit`)
        .setLabel("+1% Critic")
        .setEmoji("🔹")
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

// ─── Classes ─────────────────────────────────────────────────────────────────
export function buildClassEmbed(
  player: Player,
  items: PlayerItem[] = [],
): EmbedBuilder {
  const classKey = player.class;
  if (classKey && isClassKey(classKey)) {
    const cls = CLASSES[classKey];
    const level = player.classLevel ?? 1;
    const stats = classStats(classKey, level);
    const next = level < 10 ? classStats(classKey, level + 1) : null;
    const cost = classUpgradeCost(level);

    const bonusLine = (label: string, val: number, nxt?: number | null) =>
      val > 0 || (nxt ?? 0) > 0
        ? `   · ${label}: **+${val}**${nxt && nxt > val ? ` → +${nxt}` : ""}`
        : "";

    const upgradeBlock =
      level >= 10
        ? "⭐ **Nivel maxim atins!** Calea ta este desăvârșită."
        : `\n\n⬆️ **Upgrade la Nv.${level + 1}**\n` +
          `**Resurse necesare / resursele tale:**\n` +
          upgradeResourceLines(player, items, cost);

    const desc =
      `${cls.emoji} **${cls.label}** (Nv.${level})\n` +
      `> *${cls.desc}*\n\n` +
      bonusLine("⚔️ Daune", stats.attack, next?.attack) +
      "\n" +
      bonusLine("❤️ HP", stats.hp, next?.hp) +
      "\n" +
      bonusLine("🌀 Evitare", stats.dodge, next?.dodge) +
      "\n" +
      bonusLine("💥 Critic", stats.crit, next?.crit) +
      "\n" +
      (cls.xpMult !== 1 ? `   · 📚 XP ×${cls.xpMult}` : "") +
      (cls.oboliMult !== 1 ? `   · 💰 Oboli ×${cls.oboliMult}` : "") +
       `\n\n⚡ **Puterile clasei**\n` +
       `   ${CLASS_POWERS[classKey].power1.emoji} **${CLASS_POWERS[classKey].power1.label}** — ${CLASS_POWERS[classKey].power1.description}\n` +
       `   ${CLASS_POWERS[classKey].power2.emoji} **${CLASS_POWERS[classKey].power2.label}** — ${CLASS_POWERS[classKey].power2.description}\n` +
       `   *Le poți debloca și îmbunătăți din **/magazin → Puteri**. Consumul de mană și efectul cresc odată cu nivelul.*` +
      `\n\n✅ Bonusurile căii tale se aplică automat. *(O poți reseta din **/magazin → Clasă**.)*` +
      upgradeBlock;

    return new EmbedBuilder()
      .setColor(0x6d28d9)
      .setTitle("🧀  CLASA TA ÎN REGATUL CENUȘII")
      .setDescription(desc)
      .setImage(CLASS_IMG[classKey] ?? null)
      .setFooter({ text: BRAND_FOOTER });
  }
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle("🧬  ALEGE-ȚI CLASA")
    .setDescription(
      "Înainte de a intra în Umbre, alege-ți calea.\n" +
        "🎓 *Nivelul fiecărei clase se păstrează. Prima instruire e gratuită; o nouă cale costă " +
        CLASS_SWITCH_COST +
        " Oboli.*\n\n" +
         Object.entries(CLASSES)
           .map(([key, c]) => {
             const classKey = key as ClassKey;
             return `${c.emoji} **${c.label}** — ${c.desc}\n   ⚡ ${CLASS_POWERS[classKey].power1.label} · ${CLASS_POWERS[classKey].power2.label}`;
           })
          .join("\n"),
    )
    .setFooter({ text: BRAND_FOOTER });
}

export function classRows(): ActionRowBuilder<ButtonBuilder>[] {
  const keys = Object.keys(CLASSES) as ClassKey[];
  const btn = (k: ClassKey) =>
    new ButtonBuilder()
      .setCustomId(`class_pick_${k}`)
      .setLabel(CLASSES[k].label)
      .setEmoji(CLASSES[k].emoji)
      .setStyle(ButtonStyle.Primary);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      keys.slice(0, 3).map(btn),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(keys.slice(3).map(btn)),
  ];
}

// ─── Companions ──────────────────────────────────────────────────────────────
// Read-only status view. Companions are bought & upgraded from /magazin.
export function buildCompanionEmbed(player: Player): EmbedBuilder {
  if (player.companion && isCompanionKey(player.companion)) {
    const c = COMPANIONS[player.companion];
    const evolved = isCompanionEvolved(player.companionLevel);
    const img = COMPANION_IMG[player.companion];
    const embed = new EmbedBuilder()
      .setColor(0x2f8a4a)
      .setTitle("🐾  COMPANIONUL TĂU")
      .setDescription(
        `${c.emoji} **${evolved ? c.evoLabel : c.label}**${evolved ? "  ✨*(Evoluat)*" : ""}\n` +
          `*${c.lore}*\n\n` +
          `🏅 **Nivel ${player.companionLevel}**\n` +
          `🎁 **Bonus activ:** ${companionEffectiveDesc(player.companion, player.companionLevel)}\n` +
          `🔼 **La Nv.${player.companionLevel + 1}:** ${companionEffectiveDesc(player.companion, player.companionLevel + 1)} — îmbunătățire din **/magazin**\n\n` +
          (evolved
            ? "Companionul tău a evoluat la forma sa legendară!"
            : `🔓 Evoluează la **Nivel ${COMPANION_EVOLVE_LEVEL}** companion — fă îmbunătățire din **/magazin**.`),
      )
      .setFooter({ text: BRAND_FOOTER });
    const url = evolved ? img?.evo : img?.base;
    if (url) embed.setImage(url);
    return embed;
  }
  return new EmbedBuilder()
    .setColor(0x2f8a4a)
    .setTitle("🐾  COMPANIONI")
    .setDescription(
      "O creatură a Cenușii ți se poate alătura în luptă.\n" +
        `🛒 Cumpără un companion din **/magazin** (**${COMPANION_BUY_COST} Oboli**):\n\n` +
        Object.values(COMPANIONS)
          .map((c) => `${c.emoji} **${c.label}** — ${c.desc}`)
          .join("\n") +
        `\n\n✨ La **Nivel ${COMPANION_EVOLVE_LEVEL}** companionul evoluează în forma legendară.`,
    )
    .setFooter({ text: BRAND_FOOTER });
}

// ─── Oracle random messages ──────────────────────────────────────────────────
const ORACLE_LINES = [
  "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*„Nu toți cei care luptă vor supraviețui… dar toți vor fi amintiți.”*",
  "🕯️ *„Umbrele cresc… pregătește-te.”* 🕯️",
  "🔮 **ORACOLUL CENUȘII ȘOPTEȘTE** 🔮\n*„Cenușa de azi este focul de mâine.”*",
  "🌑 *„Cei care fug trăiesc o clipă mai mult, dar mor uitați.”* 🌑",
  "🔮 *„Aud pași în Abis… ceva mare se trezește.”* 🔮",
  "🕯️ *„Forja nu doarme niciodată. Nici Umbrele.”* 🕯️",
];
export function oracleMessage(): string {
  return ORACLE_LINES[Math.floor(Math.random() * ORACLE_LINES.length)]!;
}

// ─── Final boss ──────────────────────────────────────────────────────────────
export type BossRarity = "comun" | "rar" | "epic" | "legendar";

export const BOSS_RARITY_DATA: Record<
  BossRarity,
  { label: string; emoji: string; color: number; hpMult: number }
> = {
  comun: { label: "Comun", emoji: "⚪", color: 0x7f1d1d, hpMult: 1 },
  rar: { label: "Rar", emoji: "🔵", color: 0x1e3a8a, hpMult: 1.5 },
  epic: { label: "Epic", emoji: "🟣", color: 0x5b21b6, hpMult: 2.5 },
  legendar: { label: "Legendar", emoji: "🟠", color: 0xb45309, hpMult: 4 },
};

export function bossMaxHp(level: number, rarity: BossRarity): number {
  return Math.round(level * 2000 * BOSS_RARITY_DATA[rarity].hpMult);
}

export function buildHpBar(current: number, max: number, size = 12): string {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  let filled = Math.round(pct * size);
  if (current > 0 && filled === 0) filled = 1;
  const color = pct > 0.6 ? "🟩" : pct > 0.3 ? "🟨" : "🟥";
  return color.repeat(filled) + "⬛".repeat(size - filled);
}

export interface BossPlayerStats {
  atk: number;
  def: number;
  dodge: number;
  crit: number;
  maxHp: number;
}

export function buildFinalBossEmbed(
  level: number,
  rarity: BossRarity = "comun",
  currentHp?: number,
  maxHp?: number,
  damageBy?: Map<string, number>,
  playerNames?: Map<string, string>,
  playerHp?: Map<string, number>,
  playerStats?: Map<string, BossPlayerStats>,
  expiresAt?: number,
  charge = 0,
  bossVeteranRank = 0,
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[rarity];
  const defeated = currentHp !== undefined && currentHp <= 0;
  const bossIdentity = BOSSES[bossIndex(level)]!;

  // ── Header ──────────────────────────────────────────────────────────────────
  let desc = defeated
    ? "*Cenușa se ridică, iar tăcerea cuprinde câmpul de luptă.*\n\n"
    : "*Cerul Regatului se întunecă, iar cenușa se ridică în vârtejuri.*\n**Ultima încercare a Regatului a sosit.**\n\n";

  if (!defeated) {
    desc += `👁️ **${bossIdentity.name}** — *${bossIdentity.desc}*\n`;
    desc += `${bossIdentity.ability.emoji} Abilitate: **${bossIdentity.ability.name}** ${chargeBar(charge, FINAL_BOSS_CHARGE_MAX)}\n`;
    desc += `⚡ *Fiecare lovitură umple bara — când e plină, bossul își dezlănțuie abilitatea asupra tuturor!*\n\n`;
  }

  // ── HP bar ───────────────────────────────────────────────────────────────────
  const vetLine =
    (bossVeteranRank > 0
      ? `🏅 Rang veteran: **Rang ${bossVeteranRank} · ${veteranTierLabel(bossVeteranRank)}** — *s-a întors mai puternic! +${bossVeteranRank * 20}% viață și daune*\n`
      : "") +
    (bossVeteranRank >= VETERAN_RANK_CAP
      ? `👑 **RANG VETERAN MAXIM!** *Cea mai puternică formă a acestui boss — pradă de veteran suprem: recompensă ×${VETERAN_MAX_REWARD_MULT}!*\n`
      : "");
  if (currentHp !== undefined && maxHp !== undefined) {
    const bar = buildHpBar(currentHp, maxHp);
    const pct = Math.round((Math.max(0, currentHp) / maxHp) * 100);
    desc += `${rd.emoji} Raritate: **${rd.label}**\n`;
    desc += vetLine;
    desc += `❤️ **${Math.max(0, currentHp).toLocaleString()} / ${maxHp.toLocaleString()} HP**\n`;
    desc += `${bar} ${pct}%\n`;
  } else {
    desc += `${rd.emoji} Raritate: **${rd.label}**\n`;
    desc += vetLine;
  }

  // ── Body ─────────────────────────────────────────────────────────────────────
  if (defeated) {
    desc += `\n💀 **${bossIdentity.name.toUpperCase()} A CĂZUT! REGATUL ESTE SALVAT!**\n\nToți participanții au primit recompensa!`;
  } else {
    desc +=
      "\n🐉 Lovește-l împreună cu echipa! Oricine poate participa.\n" +
      "🏅 **+50 Rep · +150 Oboli · +250 XP** pentru toți luptătorii\n" +
      "⏱️ Cooldown per jucător: **4 secunde**";
    if (expiresAt) {
      desc += `\n⏳ Bossul fuge **<t:${Math.floor(expiresAt / 1000)}:R>**`;
    }
  }

  // ── Per-player leaderboard ────────────────────────────────────────────────────
  if (damageBy && damageBy.size > 0 && playerNames) {
    const sorted = [...damageBy.entries()].sort((a, b) => b[1] - a[1]);
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
    const lines = sorted.slice(0, 8).map(([id, dmg], i) => {
      const name = playerNames.get(id) ?? "???";
      const medal = medals[i] ?? `${i + 1}.`;
      const hp = playerHp?.get(id);
      const stats = playerStats?.get(id);
      const maxHpVal = stats?.maxHp ?? 100;

      const hpStr =
        hp === undefined
          ? ""
          : hp <= 0
            ? "  ·  ⚰️ Doborât"
            : `  ·  ❤️ ${hp}/${maxHpVal} HP`;

      const statsStr = stats
        ? `\n↳ ⚔️+${stats.atk} · 🛡️+${stats.def} · 🌀${stats.dodge}% · 💥${stats.crit}%`
        : "";

      return `${medal} **${name}** — 🎯 ${dmg.toLocaleString()} dmg${hpStr}${statsStr}`;
    });
    desc += `\n\n━━━━━━━━━━━━━━━━━━\n⚔️ **LUPTĂTORI (${sorted.length})**\n\n${lines.join("\n")}`;
  }

  const embed = new EmbedBuilder()
    .setColor(rd.color)
    .setTitle(`🐉  ${bossIdentity.name.toUpperCase()} – NIVEL ${level}  🐉`)
    .setDescription(desc)
    .setImage(bossImg(bossIndex(level)) ?? IMG.dragon);

  return embed;
}

const RARITY_MULT: Record<BossRarity, number> = {
  comun: 1,
  rar: 1.5,
  epic: 2,
  legendar: 3,
};
const BASE_REP = 50,
  BASE_GOLD = 150,
  BASE_XP = 250;

const HIT_BONUS_XP = 5,
  HIT_BONUS_GOLD = 3,
  HIT_BONUS_REP = 2;

export function computeBossRewards(
  damageBy: Map<string, number>,
  rarity: BossRarity,
  hitsBy?: Map<string, number>,
  bossVeteranRank = 0,
): Map<string, { rep: number; gold: number; xp: number }> {
  const rm = RARITY_MULT[rarity];
  const vm = veteranRewardMult(bossVeteranRank);
  const sorted = [...damageBy.entries()]
    .filter(([, dmg]) => dmg > 0)
    .sort((a, b) => b[1] - a[1]);
  const result = new Map<string, { rep: number; gold: number; xp: number }>();
  sorted.forEach(([id], i) => {
    const rankMult = i === 0 ? 3 : i < 3 ? 2 : 1;
    const hits = hitsBy?.get(id) ?? 0;
    const hitBonusXp = hits * HIT_BONUS_XP * rm;
    const hitBonusGold = hits * HIT_BONUS_GOLD * rm;
    const hitBonusRep = hits * HIT_BONUS_REP * rm;
    result.set(id, {
      rep: Math.round((BASE_REP * rankMult * rm + hitBonusRep) * vm),
      gold: Math.round((BASE_GOLD * rankMult * rm + hitBonusGold) * vm),
      xp: Math.round((BASE_XP * rankMult * rm + hitBonusXp) * vm),
    });
  });
  return result;
}

export function buildBossLeaderboard(
  bossInfo: {
    level: number;
    rarity: BossRarity;
    maxHp: number;
    defeated: boolean;
    veteranRank?: number;
  },
  damageMap: Map<string, number>,
  participants: Array<{
    username: string;
    discordId: string;
    monsterLevel: number;
    totalDamage: number;
    isAlive: boolean;
  }>,
  playerNames?: Map<string, string>,
  playerHp?: Map<string, number>,
  hitsBy?: Map<string, number>,
): EmbedBuilder {
  const rd = BOSS_RARITY_DATA[bossInfo.rarity];
  const rewards = computeBossRewards(
    damageMap,
    bossInfo.rarity,
    hitsBy,
    bossInfo.veteranRank ?? 0,
  );

  // Build a unified map of everyone who did damage
  const allIds = new Set([
    ...damageMap.keys(),
    ...participants.map((p) => p.discordId),
  ]);
  const participantMap = new Map(participants.map((p) => [p.discordId, p]));

  const ranked = [...allIds]
    .map((id) => {
      const p = participantMap.get(id);
      const name = p?.username ?? playerNames?.get(id) ?? "???";
      return {
        discordId: id,
        username: name,
        bossDamage: damageMap.get(id) ?? 0,
        monsterLevel: p?.monsterLevel ?? 0,
        totalDamage: p?.totalDamage ?? 0,
        inEvent: !!p,
      };
    })
    .sort(
      (a, b) => b.bossDamage - a.bossDamage || b.monsterLevel - a.monsterLevel,
    );

  const medals = ["🥇", "🥈", "🥉"];
  const lines = ranked.slice(0, 10).map((p, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;

    // HP status
    const hp = playerHp?.get(p.discordId);
    const hpStr =
      hp === undefined
        ? ""
        : hp <= 0
          ? " | ⚰️ Doborât"
          : ` | ❤️ ${hp} HP rămase`;

    // Reward line
    const rew = rewards.get(p.discordId);
    const rewStr = rew
      ? ` | 🏅 +${rew.rep} Rep  +${rew.gold} Oboli  +${rew.xp} XP`
      : "";

    const hits = hitsBy?.get(p.discordId) ?? 0;
    const hitsStr = hits > 0 ? ` | ⚔️ ${hits} lovituri` : "";

    const bossStr =
      p.bossDamage > 0
        ? `🐉 ${p.bossDamage.toLocaleString()} daune`
        : `🐉 Nu a lovit`;

    if (p.inEvent) {
      return `${medal} **${p.username}** — ${bossStr}${hitsStr}${hpStr} | 🎚️ Niv.**${p.monsterLevel}** | 💥 ${p.totalDamage.toLocaleString()} Eveniment${rewStr}`;
    }
    return `${medal} **${p.username}** — ${bossStr}${hitsStr}${hpStr}${rewStr}`;
  });

  const rarityBonus =
    RARITY_MULT[bossInfo.rarity] > 1
      ? ` ✨ Bonus raritate ×${RARITY_MULT[bossInfo.rarity]}`
      : "";
  const veteranBonus =
    (bossInfo.veteranRank ?? 0) >= VETERAN_RANK_CAP
      ? ` 👑 Bonus veteran suprem ×${VETERAN_MAX_REWARD_MULT}`
      : "";
  const bossName = BOSSES[bossIndex(bossInfo.level)]!.name;
  const title = bossInfo.defeated
    ? `🏆 CLASAMENT FINAL — ${bossName} a Căzut!`
    : `📜 CLASAMENT FINAL — ${bossName} a Scăpat…`;

  return new EmbedBuilder()
    .setColor(bossInfo.defeated ? 0xffd700 : 0x555555)
    .setTitle(title)
    .setDescription(
      `${rd.emoji} **${bossName} — Nivel ${bossInfo.level}** — ${rd.label} | HP: ${bossInfo.maxHp.toLocaleString()}${rarityBonus}${veteranBonus}\n\n` +
        (lines.length > 0 ? lines.join("\n") : "_Niciun participant._"),
    )
    .setFooter({ text: "Recompensele au fost distribuite automat." })
    .setTimestamp();
}

export function finalBossRow(eventId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`finalboss_${eventId}`)
      .setLabel("Lovește Dragonul")
      .setEmoji("🐉")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`bossability_${eventId}_empower`)
      .setLabel("Putere ofensivă")
      .setEmoji("⚡")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bossability_${eventId}_shield`)
      .setLabel("Putere defensivă")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary),
  );
}
