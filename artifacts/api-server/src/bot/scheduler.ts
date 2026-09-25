import { Client, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Message } from "discord.js";
import { logger } from "../lib/logger";
import { buildStartEmbed, buildExpiredCronica, buildChestEmbed, rollChest, oracleMessage, buildFinalBossEmbed, buildBossLeaderboard, buildEventLeaderboard, buildLockedChestEmbed, buildKeyChestEmbed, spawnLockedChest, rollKeyChestType, computeBossRewards, prestigeGoldMult, finalBossRow, bossMaxHp, veteranRank, veteranMult, CHEST_RARITIES, type ChestVariant, type BossRarity, type BossPlayerStats } from "./survival";
import { triggerRandomBattleEvent } from "./combat-events";
import { getRewardMultipliers } from "./status-effects";
import { startOracle, setOracleExtatic } from "./oracle";
import { rehydrateCouncilDecree, startOracleCouncilScheduler, stopOracleCouncilScheduler } from "./oracle-council";
import { createEvent, deactivateEvent, getExpiredActiveEvents, getEventParticipants, getAllEvents, setEventDecreeMessage, deleteEvent, getLatestActiveEvent, getActiveEvent, setHonorTitle, addPlayerReputation, addPlayerGold, addPlayerXp, getPrestigeLevels, persistActiveBoss, loadActiveBossRowsByGuild, deleteActiveBoss, createActiveBossesTableIfNotExists, persistActiveChest, loadActiveChest, clearActiveChest, getFinalBossKills, KEYCHEST_DBKEY, LOCKCHEST_DBKEY, runMultiGuildMigrations, loadLeaderboardMessageId, saveLeaderboardMessageId, type LeaderboardFeedType } from "./db";
import { getChannel, initChannelConfig, hasAnyChannelConfigured, type EventType } from "./channel-config";
import { isTicketCategoryParentId } from "./ticket-categories";
import {
  openFratiaVote,
  rehydrateFratiaVote,
  spawnSeasonalChest,
  rehydrateSeasonalChest,
  rehydrateHiddenChest,
  settleExpiredAuction,
} from "./chest-expansions";
import { setTributeGamePaused, startTributeScheduler, stopTributeScheduler } from "./tribute";
import { getGameplayConfig, isGameplayPaused } from "./gameplay-store";
import { startDailyStatsScheduler, stopDailyStatsScheduler } from "./daily-stats";

const APPLICATION_ID = "1472675543777280071";
export const EVENT_DURATION_MS = 60 * 60 * 1000;
const FINAL_BOSS_ACTIVE_MS = 30 * 60 * 1000;
const MIN_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_COOLDOWN_MS = 2 * 60 * 60 * 1000;

const CHEST_INTERVAL_MS = 60 * 60 * 1000;
/** How long a classic chest remains claimable before its message is removed. */
export const CHEST_EXPIRE_MS = 20 * 60 * 1000;
/** How long an ended Ora Umbrelor message remains visible for its recap. */
export const EVENT_MESSAGE_RETENTION_MS = 20 * 60 * 1000;
/** The classic ordinary chest is intentionally scheduled once per hour. */
export const LEGACY_CHEST_SPAWNS_ENABLED = true;

const ORACLE_INTERVAL_MS = 25 * 60 * 1000;
const BATTLE_EVENT_INTERVAL_MS = 7 * 60 * 1000;

function eventDurationMs(guildId: string): number {
  return getGameplayConfig(guildId).events.eventDurationMinutes * 60_000;
}
function readEnvInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    logger.warn({ name, value: raw, fallback }, "Invalid chest-activity tuning value — using default");
    return fallback;
  }
  if (parsed > max) {
    logger.warn({ name, value: raw, max }, "Chest-activity tuning value above max — clamping");
    return max;
  }
  return parsed;
}

/** Minutes of chat silence before chest/key-chest timers skip their spawn.
 *  Env: ACTIVITY_WINDOW_MINUTES (default 20, max 120). Requires bot restart. */
export const ACTIVITY_WINDOW_MINUTES = readEnvInt("ACTIVITY_WINDOW_MINUTES", 20, 120);
const ACTIVITY_WINDOW_MS = ACTIVITY_WINDOW_MINUTES * 60_000;

/** Retained for compatibility with the in-memory activity counters. */
export const CHEST_MSG_MILESTONE = readEnvInt("CHEST_MSG_MILESTONE", 25, 200);

/** Retained for compatibility with the in-memory activity counters. */
export const KEY_CHEST_MSG_MILESTONE = readEnvInt("KEY_CHEST_MSG_MILESTONE", 50, 400);
const SERVER_CHEST_MSG_MILESTONE = readEnvInt("SERVER_CHEST_MSG_MILESTONE", 75, 1000);
/** Human messages in the main channel between seasonal chest spawns. */
export const SEASONAL_CHEST_MSG_MILESTONE = readEnvInt("SEASONAL_CHEST_MSG_MILESTONE", 10, 100);

// ─── Per-guild scheduler state ─────────────────────────────────────────────────

interface GuildSchedulerState {
  claimedChests: Set<string>;
  activeBossMap: Map<number, BossState>;
  firingChest: boolean;
  firingKeyChest: boolean;
  firingEvent: boolean;
  lastChestMessageId: string | null;
  lastChestTimeout: ReturnType<typeof setTimeout> | null;
  standaloneBossId: number | null;
  started: boolean;
  stopped: boolean;
  runGeneration: number;
  /** Timestamp (ms) of the last non-bot message in this guild. 0 = never seen. */
  lastActivityAt: number;
  /** Rolling count of non-bot messages since the last milestone chest roll. */
  activityMsgCount: number;
  /** Rolling count of non-bot messages since the last milestone key-chest roll. */
  keyMsgCount: number;
  /** Rolling count of non-bot messages since the last seasonal chest. */
  seasonalMsgCount: number;
}

export const guildStates = new Map<string, GuildSchedulerState>();

function getOrCreateGuildState(guildId: string): GuildSchedulerState {
  let state = guildStates.get(guildId);
  if (!state) {
    state = {
      claimedChests: new Set(),
      activeBossMap: new Map(),
      firingChest: false,
      firingKeyChest: false,
      firingEvent: false,
      lastChestMessageId: null,
      lastChestTimeout: null,
      standaloneBossId: null,
      started: false,
      stopped: false,
      runGeneration: 0,
      lastActivityAt: 0,
      activityMsgCount: 0,
      keyMsgCount: 0,
      seasonalMsgCount: 0,
    };
    guildStates.set(guildId, state);
  }
  return state;
}

async function deleteChestMessage(
  message: { id?: string; delete: () => Promise<unknown> },
  context: { chestId: string; guildId: string; phase: string },
): Promise<void> {
  try {
    await message.delete();
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
    if (code === "10008") return;
    logger.warn({ err, messageId: message.id, ...context }, "Failed to delete chest message");
  }
}

function buildChestRow(
  chestId: string,
  rarity: { key: string; emoji: string },
  gold: number,
  mult?: 2 | 3,
): ActionRowBuilder<ButtonBuilder> {
  const choices = rarity.key === "bronz"
    ? [{ key: "gold", label: `Aur (${gold})`, emoji: "💰", style: ButtonStyle.Success }, { key: "xp", label: "Experiență", emoji: "✨", style: ButtonStyle.Primary }]
    : rarity.key === "argint"
      ? [{ key: "gold", label: `Aur (${gold})`, emoji: "💰", style: ButtonStyle.Success }, { key: "xp", label: "Experiență", emoji: "✨", style: ButtonStyle.Primary }, { key: "blessing", label: "Binecuvântare", emoji: "🕯️", style: ButtonStyle.Secondary }]
      : [{ key: "gold", label: `Aur${mult ? ` ×${mult}` : ""}`, emoji: "💰", style: ButtonStyle.Success }, { key: "blessing", label: "Binecuvântare", emoji: "🕯️", style: ButtonStyle.Secondary }, { key: "relic", label: "Fragment relicvă", emoji: "💎", style: ButtonStyle.Primary }];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...choices.map((choice) => new ButtonBuilder()
      .setCustomId(`${chestId}_${choice.key}`)
      .setLabel(choice.label)
      .setEmoji(choice.emoji)
      .setStyle(choice.style)),
  );
}

function rollChestVariant(): ChestVariant {
  const roll = Math.random();
  if (roll < 0.18) return "razboi";
  if (roll < 0.34) return "blestemat";
  if (roll < 0.50) return "oracolului";
  if (roll < 0.70) return "umbrelor";
  if (roll < 0.84) return "fratie";
  return "aur";
}

// ─── Activity tracking (per-guild) ────────────────────────────────────────────

/**
 * Pure helper — true when `lastActivityAt` is within the given window.
 * Exported for unit tests; call site is `recordGuildActivity`.
 */
export function isGuildActive(lastActivityAt: number, windowMs: number, now = Date.now()): boolean {
  return lastActivityAt > 0 && now - lastActivityAt <= windowMs;
}

/**
 * Biased rarity roll for activity-triggered bonus chests.
 * Intentionally weaker than the normal timer roll: no Mitic, scarce Gold.
 * Weights: Bronz 70%, Argint 25%, Aur 5%.
 * Exported for unit testing; call sites are within this module only.
 */
export function rollActivityRarityKey(): string {
  const r = Math.random() * 100;
  if (r < 70) return "bronz";
  if (r < 95) return "argint";
  return "aur";
}

/**
 * Key type for activity-triggered bonus key chests: "rar" or "epic".
 * Rar = 60%, Epic = 40% — intentionally skews toward the cheaper key.
 * Exported for unit testing; call sites are within this module only.
 */
export function rollActivityKeyType(): "rar" | "epic" {
  return Math.random() < 0.60 ? "rar" : "epic";
}

/**
 * Called by the MessageCreate handler for non-bot messages in the guild's
 * configured main channel only. Three effects:
 *  1. Updates the guild's last-activity timestamp — used as the gate in
 *     `fireChest` / `fireKeyChest` to suppress spawns on silent servers.
 *  2. Retains the older in-memory counters for compatibility.
 *  3. Increments `seasonalMsgCount`; every 10 main-channel messages it
 *     triggers one seasonal chest. `spawnSeasonalChest` suppresses a duplicate
 *     while the previous seasonal chest is still active.
 */
export function recordGuildActivity(client: Client, guildId: string): void {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  gs.lastActivityAt = Date.now();

  gs.activityMsgCount += 1;
  if (gs.activityMsgCount >= CHEST_MSG_MILESTONE) {
    gs.activityMsgCount = 0;
  }

  gs.keyMsgCount += 1;
  if (gs.keyMsgCount >= KEY_CHEST_MSG_MILESTONE) {
    gs.keyMsgCount = 0;
  }

  gs.seasonalMsgCount += 1;
  if (gs.seasonalMsgCount >= SEASONAL_CHEST_MSG_MILESTONE) {
    gs.seasonalMsgCount = 0;
    void spawnSeasonalChest(client, guildId).catch((err) =>
      logger.warn({ err, guildId }, "Failed to spawn seasonal chest from message milestone"),
    );
  }

  // The Frăția meter is durable and shared by the whole guild. It deliberately
  // advances on every human message, while the existing rolling counters retain
  // their lightweight in-memory behavior for the ordinary bonus rolls.
  // Resolve this helper lazily so older test doubles and partially deployed
  // bot modules continue to work while the migration rolls out.
  void import("./db").then((dbModule) => {
    const updateMeter = (dbModule as typeof import("./db") & {
      incrementServerChestProgress?: (guildId: string, target: number) => Promise<{ progress: number; triggered: boolean }>;
    }).incrementServerChestProgress;
    if (typeof updateMeter !== "function") return;
    return updateMeter(guildId, SERVER_CHEST_MSG_MILESTONE).then((meter) => {
      if (meter.triggered && !gs.stopped) {
        void openFratiaVote(client, guildId).catch((err) =>
          logger.warn({ err, guildId }, "Failed to open Chivotul Frăției"),
        );
      }
    });
  }).catch((err) => logger.debug({ err, guildId }, "Server chest meter update skipped"));
}

/** Stop the scheduler for a guild (e.g. bot left the server). Future timer
 *  callbacks will no-op via the stopped flag; existing timers cannot be
 *  cancelled without tracking refs, but they become inert after this call. */
export function stopGuildScheduler(
  guildId: string,
  options: { stopOracle?: boolean } = {},
) {
  if (options.stopOracle) stopOracleCouncilScheduler(guildId);
  stopTributeScheduler(guildId);
  stopDailyStatsScheduler(guildId);
  setTributeGamePaused(guildId, true);
  const gs = guildStates.get(guildId);
  if (gs) {
    gs.stopped = true;
    gs.started = false;
    // Keep the state object in the Map so isStopped() closures (which read
    // guildStates.get(guildId)?.stopped) correctly see stopped=true even after
    // the guild is gone. If the bot later rejoins, startGuildScheduler resets
    // the flags before registering new timers.
  }
  logger.info({ guildId }, "Guild scheduler stopped — bot left guild");
}

/** Get the claimedChests set for a guild (creates state if missing). */
export function getGuildClaimedChests(guildId: string): Set<string> {
  return getOrCreateGuildState(guildId).claimedChests;
}

export function isGuildGameStopped(guildId: string): boolean {
  return getOrCreateGuildState(guildId).stopped || isGameplayPaused(guildId);
}

/** Get the activeBossMap for a guild (creates state if missing). */
export function getGuildActiveBossMap(guildId: string): Map<number, BossState> {
  return getOrCreateGuildState(guildId).activeBossMap;
}

// ─── Boss shared HP state ─────────────────────────────────────────────────────
export type { BossPlayerStats };

export interface BossState {
  eventId: number;
  /** Guild this boss belongs to — used for DB calls and channel lookups. */
  guildId: string;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  channelId: string;
  lastHitAt: Map<string, number>;
  damageBy: Map<string, number>;
  hitsBy: Map<string, number>; // attack count per player (for reward scaling)
  playerHp: Map<string, number>;
  playerNames: Map<string, string>;
  playerStats: Map<string, BossPlayerStats>;
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  expiresAt: number;
  standalone: boolean;
  abilityReadyAt: Map<string, number>;
  empowerNext: Set<string>;
  /** Active Ash Shields: per player, the shield's remaining HP and ability level. */
  shieldNext: Map<string, { hp: number; level: number }>;
  defeated: boolean;
  /** Shared ability charge bar — fills with every player hit. */
  charge: number;
  /** Veteran rank 0–5 from the guild's past final-boss defeats — +20% HP/dmg per rank. */
  veteranRank: number;
}

// ─── Boss state serialization / deserialization ────────────────────────────────

interface SerializedBossState {
  eventId: number;
  guildId: string;
  level: number;
  rarity: BossRarity;
  maxHp: number;
  currentHp: number;
  messageId: string;
  channelId: string;
  lastHitAt: [string, number][];
  damageBy: [string, number][];
  hitsBy: [string, number][];
  playerHp: [string, number][];
  playerNames: [string, string][];
  playerStats: [string, BossPlayerStats][];
  participants: Array<{ username: string; discordId: string; monsterLevel: number; totalDamage: number; isAlive: boolean }>;
  expiresAt: number;
  standalone: boolean;
  abilityReadyAt: [string, number][];
  empowerNext: string[];
  /** Old saves stored a plain string[]; new saves store [id, {hp, level}] entries. */
  shieldNext: string[] | [string, { hp: number; level: number }][];
  defeated: boolean;
  charge?: number;
  veteranRank?: number;
}

function serializeBoss(boss: BossState): string {
  const s: SerializedBossState = {
    eventId: boss.eventId,
    guildId: boss.guildId,
    level: boss.level,
    rarity: boss.rarity,
    maxHp: boss.maxHp,
    currentHp: boss.currentHp,
    messageId: boss.messageId,
    channelId: boss.channelId,
    lastHitAt: [...boss.lastHitAt.entries()],
    damageBy: [...boss.damageBy.entries()],
    hitsBy: [...boss.hitsBy.entries()],
    playerHp: [...boss.playerHp.entries()],
    playerNames: [...boss.playerNames.entries()],
    playerStats: [...boss.playerStats.entries()],
    participants: boss.participants,
    expiresAt: boss.expiresAt,
    standalone: boss.standalone,
    abilityReadyAt: [...boss.abilityReadyAt.entries()],
    empowerNext: [...boss.empowerNext],
    shieldNext: [...boss.shieldNext.entries()],
    defeated: boss.defeated,
    charge: boss.charge,
    veteranRank: boss.veteranRank,
  };
  return JSON.stringify(s);
}

function deserializeBoss(json: string, fallbackGuildId?: string): BossState {
  const s = JSON.parse(json) as SerializedBossState;
  return {
    eventId: s.eventId,
    guildId: s.guildId ?? fallbackGuildId ?? "1382035307607883816",
    level: s.level,
    rarity: s.rarity,
    maxHp: s.maxHp,
    currentHp: s.currentHp,
    messageId: s.messageId,
    channelId: s.channelId,
    lastHitAt: new Map(s.lastHitAt),
    damageBy: new Map(s.damageBy),
    hitsBy: new Map(s.hitsBy ?? []),
    playerHp: new Map(s.playerHp),
    playerNames: new Map(s.playerNames),
    playerStats: new Map(s.playerStats),
    participants: s.participants,
    expiresAt: s.expiresAt,
    standalone: s.standalone,
    abilityReadyAt: new Map(s.abilityReadyAt),
    empowerNext: new Set(s.empowerNext),
    // Old saves stored just the player ids (mana-backed shields) — those
    // shields can't be restored to the new own-HP model, so they are dropped.
    shieldNext: new Map(
      (s.shieldNext ?? []).filter((e): e is [string, { hp: number; level: number }] => Array.isArray(e)),
    ),
    defeated: s.defeated,
    charge: s.charge ?? 0,
    veteranRank: s.veteranRank ?? 0,
  };
}

// Persist the current snapshot of a boss fight to DB.
export async function persistBossState(boss: BossState): Promise<void> {
  try {
    await persistActiveBoss(boss.eventId, boss.guildId, serializeBoss(boss), new Date(boss.expiresAt));
  } catch (err) {
    logger.error({ err, eventId: boss.eventId }, "Failed to persist boss state");
  }
}

// ─── Final-boss eligibility guard ─────────────────────────────────────────────
export type BossEligibilityResult =
  | { ok: true }
  | { ok: false; reason: "no_boss" | "defeated" | "dead" };

export function checkBossEligibility(
  boss: BossState | undefined,
  uid: string,
): BossEligibilityResult {
  if (!boss) return { ok: false, reason: "no_boss" };
  if (boss.defeated) return { ok: false, reason: "defeated" };
  const bossHp = boss.playerHp.get(uid);
  if (bossHp !== undefined && bossHp <= 0) return { ok: false, reason: "dead" };
  return { ok: true };
}

// ─── Boss hit cooldown guard ───────────────────────────────────────────────────
export const BOSS_HIT_COOLDOWN_MS = 4000;

export type BossCooldownResult =
  | { onCooldown: false }
  | { onCooldown: true; remainingSeconds: number };

export function checkBossHitCooldown(
  lastHitAt: Map<string, number>,
  uid: string,
  now = Date.now(),
): BossCooldownResult {
  const lastHit = lastHitAt.get(uid) ?? 0;
  const elapsed = now - lastHit;
  if (elapsed < BOSS_HIT_COOLDOWN_MS) {
    return { onCooldown: true, remainingSeconds: Math.ceil((BOSS_HIT_COOLDOWN_MS - elapsed) / 1000) };
  }
  return { onCooldown: false };
}

export const BOSS_RARITY_WEIGHTS: [BossRarity, number][] = [
  ["comun", 60], ["rar", 25], ["epic", 12], ["legendar", 3],
];
function rollBossRarity(): BossRarity {
  const total = BOSS_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of BOSS_RARITY_WEIGHTS) {
    if ((roll -= w) <= 0) return r;
  }
  return "comun";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const eventMessageDeletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const EVENT_MESSAGE_DELETE_RETRY_MS = 60_000;

interface EventCleanupFailure {
  target: "event" | "decree";
  phase: "channel-config" | "channel-fetch" | "message-fetch" | "message-delete";
  code: string;
  message: string;
  messageId: string;
  channelId?: string;
}

function errorContext(err: unknown): { code: string; message: string } {
  const code = typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code ?? "UNKNOWN")
    : "UNKNOWN";
  const message = err instanceof Error
    ? err.message
    : typeof err === "string"
      ? err
      : "Unknown Discord error";
  return { code, message };
}

async function deleteTrackedEventMessage(
  client: Client,
  guildId: string,
  type: EventType,
  target: EventCleanupFailure["target"],
  messageId: string,
): Promise<EventCleanupFailure | null> {
  const channelId = getChannel(type, guildId);
  if (!channelId) {
    return {
      target,
      phase: "channel-config",
      code: "CHANNEL_UNCONFIGURED",
      message: `No ${type} channel is configured for guild`,
      messageId,
    };
  }

  let channel: unknown;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (err) {
    const context = errorContext(err);
    return { target, phase: "channel-fetch", ...context, messageId, channelId };
  }
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    return {
      target,
      phase: "channel-fetch",
      code: "CHANNEL_UNAVAILABLE",
      message: `Configured ${type} channel is unavailable or is not a text channel`,
      messageId,
      channelId,
    };
  }
  if (isTicketCategoryParentId(channel.parentId, channel.guildId)) {
    return {
      target,
      phase: "channel-fetch",
      code: "TICKET_CHANNEL",
      message: `Configured ${type} channel belongs to a ticket category`,
      messageId,
      channelId,
    };
  }

  let message: Message;
  try {
    message = await channel.messages.fetch(messageId);
  } catch (err) {
    const context = errorContext(err);
    // Discord 10008 means the tracked message is already gone. Fetch and
    // delete must treat it identically so stale rows cannot retry forever.
    if (context.code === "10008") return null;
    return { target, phase: "message-fetch", ...context, messageId, channelId };
  }

  try {
    await message.delete();
    return null;
  } catch (err) {
    const context = errorContext(err);
    if (context.code === "10008") return null;
    return { target, phase: "message-delete", ...context, messageId, channelId };
  }
}

export async function deleteEventMessages(
  client: Client,
  guildId: string,
  eventId: number,
  messageId: string,
  decreeMessageId?: string | null,
): Promise<boolean> {
  const failures: EventCleanupFailure[] = [];
  const eventFailure = await deleteTrackedEventMessage(client, guildId, "event", "event", messageId);
  if (eventFailure) failures.push(eventFailure);
  if (decreeMessageId) {
    const decreeFailure = await deleteTrackedEventMessage(client, guildId, "main", "decree", decreeMessageId);
    if (decreeFailure) failures.push(decreeFailure);
  }

  if (failures.length > 0) {
    logger.warn(
      { eventId, guildId, messageId, decreeMessageId, failures },
      "Event message cleanup will retry",
    );
  }
  return failures.length > 0;
}

export function scheduleEventMessageDeletion(
  client: Client,
  guildId: string,
  eventId: number,
  messageId: string,
  expiresAt: Date,
  decreeMessageId?: string | null,
): void {
  const timerKey = `${guildId}:${eventId}`;
  if (eventMessageDeletionTimers.has(timerKey)) return;
  const cleanupAt = expiresAt.getTime() + EVENT_MESSAGE_RETENTION_MS;
  const timer = setTimeout(async () => {
    let retry = false;
    try {
      retry = await deleteEventMessages(client, guildId, eventId, messageId, decreeMessageId);
      if (!retry) {
        await deleteEvent(eventId);
        logger.info({ eventId, guildId, messageId, decreeMessageId }, "Expired event messages and DB record cleaned up");
      }
    } catch (err) {
      retry = true;
      const context = errorContext(err);
      logger.warn(
        {
          err,
          eventId,
          guildId,
          messageId,
          decreeMessageId,
          phase: "database-delete",
          ...context,
        },
        "Expired event cleanup failed and will retry",
      );
    } finally {
      // Keep the entry while cleanup is in flight so startup/legacy cleanup
      // cannot create a second timer for the same persisted event.
      if (eventMessageDeletionTimers.get(timerKey) === timer) {
        eventMessageDeletionTimers.delete(timerKey);
      }
    }
    if (retry) {
      scheduleEventMessageDeletion(
        client,
        guildId,
        eventId,
        messageId,
        new Date(Date.now() + EVENT_MESSAGE_DELETE_RETRY_MS - EVENT_MESSAGE_RETENTION_MS),
        decreeMessageId,
      );
    }
  }, Math.max(0, cleanupAt - Date.now()));
  timer.unref?.();
  eventMessageDeletionTimers.set(timerKey, timer);
}

async function rehydrateEventMessageDeletions(client: Client, guildId: string): Promise<void> {
  try {
    await cleanupOldEvents(client, guildId);
  } catch (err) {
    logger.warn({ err, guildId }, "Failed to rehydrate event message cleanup");
  }
}

export function randomCooldown(guildId?: string) {
  const config = guildId ? getGameplayConfig(guildId).events : null;
  const min = config ? config.eventCooldownMinMinutes * 60_000 : MIN_COOLDOWN_MS;
  const max = config ? config.eventCooldownMaxMinutes * 60_000 : MAX_COOLDOWN_MS;
  return Math.floor(Math.random() * (Math.max(min, max) - min + 1)) + min;
}

// ─── Event expiry ──────────────────────────────────────────────────────────────

async function expireOldEvents(client: Client, guildId: string) {
  const expired = await getExpiredActiveEvents(guildId);
  for (const ev of expired) {
    try {
      scheduleEventMessageDeletion(client, guildId, ev.id, ev.messageId, ev.expiresAt, ev.decreeMessageId);
      const channel = await fetchChannel(client, "event", guildId);
      if (channel instanceof TextChannel) {
        const msg = await channel.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          const participants = await getEventParticipants(ev.id, guildId);
          const survivors = participants.filter((p) => p.isAlive);
          const fled = participants.filter((p) => !p.isAlive && p.fled);
          const fallen = participants.filter((p) => !p.isAlive && !p.fled);
          const cronica = buildExpiredCronica(survivors, fallen, fled);
          const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`expired_${ev.id}`)
              .setLabel("Ora Umbrelor s-a încheiat")
              .setEmoji("⌛")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          await msg.edit({ embeds: [cronica], components: [disabledRow] });

          const topCh = await fetchChannel(client, "eventTop", guildId);
          if (topCh instanceof TextChannel) {
            const leaderboard = buildEventLeaderboard(participants);
            await publishLeaderboardResult(client, guildId, "eventTop", {
              embeds: [cronica, leaderboard],
            });
          }

          const ranked = [...participants].sort((a, b) => {
            if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
            if (b.monsterLevel !== a.monsterLevel) return b.monsterLevel - a.monsterLevel;
            return b.totalDamage - a.totalDamage;
          });
          const HONOR_TITLES = ["Eroul Umbrelor", "Supraviețuitorul Cenușii", "Vânătorul Stins"];
          for (let i = 0; i < Math.min(3, ranked.length); i++) {
            const r = ranked[i]!;
            if (r.monsterLevel <= 1) continue;
            await setHonorTitle(r.discordId, guildId, HONOR_TITLES[i]!).catch(() => null);
          }
        }
      }
      await fireFinalBoss(client, guildId, ev.id);
      await deactivateEvent(ev.id);
      logger.info({ eventId: ev.id, guildId }, "Event expired");
    } catch (err) {
      logger.error({ err, eventId: ev.id, guildId }, "Failed to expire event");
    }
  }
}

// ─── Chest — forced (admin) ────────────────────────────────────────────────────

export async function fireChestForced(
  client: Client,
  guildId: string,
  rarityKey: string,
  mult?: 2 | 3,
  forcedVariant?: ChestVariant,
) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return null;
  if (gs.firingChest) {
    logger.warn({ guildId }, "fireChestForced already in progress, skipping duplicate trigger");
    return null;
  }
  gs.firingChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!(channel instanceof TextChannel)) return null;

    if (gs.lastChestTimeout) {
      clearTimeout(gs.lastChestTimeout);
      gs.lastChestTimeout = null;
    }
    if (gs.lastChestMessageId) {
      const old = await channel.messages.fetch(gs.lastChestMessageId).catch(() => null);
      if (old) await deleteChestMessage(old, { chestId: "previous", guildId, phase: "replace-forced" });
      gs.lastChestMessageId = null;
    }

    const { buildChestEmbed: bce, spawnChest: sc } = await import("./survival");
    const result = sc(rarityKey);
    if (!result) return null;
    const { rarity, gold } = result;
    const variant = forcedVariant ?? rollChestVariant();
    const chestId = mult != null
      ? `chest_${Date.now()}_${rarity.key}_${gold}_${variant}_x${mult}`
      : `chest_${Date.now()}_${rarity.key}_${gold}_${variant}`;
    const expireAt = Date.now() + chestExpireMs(guildId);

    const row = buildChestRow(chestId, rarity, gold, mult);

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    const content = mult != null
      ? `🔮 **Cufăr Binecuvântat** — ${rarity.label} apare în Regat! **×${mult} Oboli** pentru cel mai rapid!`
      : `📦 Cufăr de **${rarity.label}** apare în Regat! Revendică-l repede!`;

    const msg = await channel.send({
      content,
       embeds: [bce(gold, rarity, mult, variant, expireAt)],
      components: [lockedRow],
    });
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    gs.lastChestMessageId = msg.id;
     void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, mult, variant, expiresAt: expireAt }).catch(() => null);

    await sleep(5000);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    if (!gs.claimedChests.has(chestId)) {
       await msg.edit({ embeds: [bce(gold, rarity, mult, variant, expireAt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, mult, guildId }, "Chest spawned (forced)");

    const timeout = setTimeout(async () => {
      if (gs.claimedChests.has(chestId)) return;
      gs.claimedChests.add(chestId);
      await deleteChestMessage(msg, { chestId, guildId, phase: "expire-forced" });
      logger.info({ chestId, guildId }, "Chest expired unclaimed (forced)");
      void clearActiveChest(guildId).catch(() => null);
    }, chestExpireMs(guildId));

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire chest (forced)");
    return null;
  } finally {
    gs.firingChest = false;
  }
}

// ─── Chest — scheduled ────────────────────────────────────────────────────────

export async function fireChest(client: Client, guildId: string, bypassGate = false) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return null;
  if (gs.firingChest) {
    logger.warn({ guildId }, "fireChest already in progress, skipping duplicate trigger");
    return null;
  }
  if (!bypassGate && !isGuildActive(gs.lastActivityAt, ACTIVITY_WINDOW_MS)) {
    logger.debug({ guildId, lastActivityAt: gs.lastActivityAt, windowMinutes: ACTIVITY_WINDOW_MINUTES }, "Chest spawn skipped — no recent chat activity");
    return null;
  }
  gs.firingChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!(channel instanceof TextChannel)) return null;

    if (gs.lastChestTimeout) {
      clearTimeout(gs.lastChestTimeout);
      gs.lastChestTimeout = null;
    }
    if (gs.lastChestMessageId) {
      const old = await channel.messages.fetch(gs.lastChestMessageId).catch(() => null);
      if (old) await deleteChestMessage(old, { chestId: "previous", guildId, phase: "replace-scheduled" });
      gs.lastChestMessageId = null;
    }

    const { rarity, gold } = rollChest();
    const variant = rollChestVariant();

    const chestId = `chest_${Date.now()}_${rarity.key}_${gold}_${variant}`;
    const expireAt = Date.now() + chestExpireMs(guildId);

    const row = buildChestRow(chestId, rarity, gold);

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    const frames: Array<{ content: string; delay: number }> =
      rarity.key === "mitic"
        ? [
            { content: "🌑 *Cenușa înnegrește cerul…*", delay: 700 },
            { content: "💜 *O energie arcană pulsează prin aer…*", delay: 700 },
            { content: "⚡💎⚡ *Puterea veche se trezește!*", delay: 700 },
            { content: "💎🔮💎 **UN CUFĂR MITIC ÎȘI FACE APARIȚIA!!**", delay: 800 },
          ]
        : rarity.key === "aur"
        ? [
            { content: "✨ *O lumină aurie pâlpâie în depărtare…*", delay: 800 },
            { content: "🟡✨ *Podeaua tremură. Ceva prețios se ridică…*", delay: 800 },
            { content: "🥇🌟💰 **UN CUFĂR DE AUR!**", delay: 800 },
          ]
        : rarity.key === "argint"
        ? [
            { content: "🌫️ *Un fior rece trece prin aer…*", delay: 800 },
            { content: "🥈✨ *Un cufăr argintiu apare din ceață!*", delay: 900 },
          ]
        : [
            { content: "✨ *Ceva strălucește în cenușă…*", delay: 900 },
            { content: "🪙📦 *Un cufăr de bronz răsare din praf…*", delay: 900 },
          ];

    const msg = await channel.send({ content: frames[0]!.content });
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    gs.lastChestMessageId = msg.id;
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, variant, expiresAt: expireAt }).catch(() => null);

    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      if (gs.stopped) {
        await msg.delete().catch(() => null);
        return null;
      }
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    await msg.edit({ content: `${rarity.emoji}✨`, embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [lockedRow] }).catch(() => null);
    await sleep(500);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    await msg.edit({ content: "", embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [lockedRow] }).catch(() => null);

    await sleep(5000);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    if (!gs.claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildChestEmbed(gold, rarity, undefined, variant, expireAt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, gold, rarity: rarity.key, guildId }, "Chest spawned");

    const timeout = setTimeout(async () => {
      if (gs.claimedChests.has(chestId)) return;
      gs.claimedChests.add(chestId);
      await deleteChestMessage(msg, { chestId, guildId, phase: "expire-scheduled" });
      logger.info({ chestId, guildId }, "Chest expired unclaimed");
      void clearActiveChest(guildId).catch(() => null);
    }, chestExpireMs(guildId));

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    return { chestId, gold, expireAt };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire chest");
    return null;
  } finally {
    gs.firingChest = false;
  }
}

// ─── Old event cleanup ────────────────────────────────────────────────────────

export async function cleanupOldEvents(client: Client, guildId: string) {
  const old = await getAllEvents(guildId);
  if (old.length === 0) return;

  for (const ev of old) {
    if (ev.expiresAt.getTime() > Date.now()) continue;
    // The legacy sweep now enters the same durable retry path as normal expiry.
    // It never interprets a Discord/network error as permission to drop the row.
    scheduleEventMessageDeletion(
      client,
      guildId,
      ev.id,
      ev.messageId,
      ev.expiresAt,
      ev.decreeMessageId,
    );
  }
}

// ─── Fire event ───────────────────────────────────────────────────────────────

export async function fireEvent(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  if (gs.firingEvent) {
    logger.warn({ guildId }, "fireEvent already in progress, skipping duplicate trigger");
    return;
  }
  gs.firingEvent = true;
  try {
    const channel = await fetchChannel(client, "event", guildId);
    if (!channel) {
      return;
    }
    if (gs.stopped) return;

    void cleanupOldEvents(client, guildId).catch((err) =>
      logger.warn({ err, guildId }, "Failed to schedule legacy event cleanup"),
    );

    const expiresAt = new Date(Date.now() + eventDurationMs(guildId));

    const placeholder = await channel.send({ embeds: [buildStartEmbed()] });
    if (gs.stopped) {
      await placeholder.delete().catch(() => null);
      return;
    }
    const ev = await createEvent(guildId, "ora_umbrelor", placeholder.id, expiresAt);

    const joinRowFinal = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ora_join_${ev.id}`)
        .setLabel("Intră în Luptă")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Danger),
    );
    await placeholder.edit({ embeds: [buildStartEmbed(expiresAt)], components: [joinRowFinal] }).catch(() => null);

    logger.info({ eventId: ev.id, guildId }, "Ora Umbrelor fired");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire event");
  } finally {
    gs.firingEvent = false;
  }
}

// ─── Final boss ───────────────────────────────────────────────────────────────

export async function fireFinalBoss(client: Client, guildId: string, eventId: number) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  try {
    const ev = await getActiveEvent(eventId, guildId);
    if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) return;

    const channel = await fetchChannel(client, "boss", guildId);
    if (!channel) return;

    const participants = await getEventParticipants(eventId, guildId);
    if (gs.stopped) return;
    const aliveParticipants = participants.filter((p) => p.isAlive);
    const avgLevel = aliveParticipants.length
      ? Math.ceil(aliveParticipants.reduce((s, p) => s + p.monsterLevel, 0) / aliveParticipants.length)
      : 1;
    const bossLevel = Math.max(5, Math.ceil(avgLevel / 2));
    const rarity = rollBossRarity();
    const maxHp = bossMaxHp(bossLevel, rarity);
    const bossExpiresAt = Date.now() + finalBossDurationMs(guildId);

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(bossLevel, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt, 0, 0)],
      components: [finalBossRow(eventId)],
    });
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return;
    }

    const boss: BossState = {
      eventId,
      guildId,
      level: bossLevel,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: channel.id,
      expiresAt: bossExpiresAt,
      standalone: false,
      lastHitAt: new Map(),
      damageBy: new Map(),
      hitsBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: participants.map((p) => ({
        username: p.username,
        discordId: p.discordId,
        monsterLevel: p.monsterLevel,
        totalDamage: p.totalDamage,
        isAlive: p.isAlive,
      })),
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Map(),
      defeated: false,
      charge: 0,
      veteranRank: 0,
    };
    gs.activeBossMap.set(eventId, boss);
    await persistBossState(boss);
    setOracleExtatic();
    scheduleEscapeTimer(boss, client);

    logger.info({ eventId, bossLevel, rarity, maxHp, guildId }, "Final boss summoned");
  } catch (err) {
    logger.error({ err, eventId, guildId }, "Failed to summon final boss");
  }
}

// ─── Standalone boss ──────────────────────────────────────────────────────────

const STANDALONE_BOSS_MIN_MS = 30 * 60_000;
const STANDALONE_BOSS_MAX_MS = 60 * 60_000;
const STANDALONE_BOSS_ACTIVE_MS = 60 * 60_000;

/**
 * Fetch a guild's configured channel. Returns null if the channel is not
 * configured (guild must run /setcanal) or cannot be fetched from Discord.
 * All scheduler actions that post to a channel MUST guard on null return.
 */
async function fetchChannel(client: Client, type: EventType, guildId: string): Promise<TextChannel | null> {
  const id = getChannel(type, guildId);
  if (!id) {
    logger.warn({ guildId, type }, "Channel not configured for guild — action skipped (run /setcanal)");
    return null;
  }
  const ch = await client.channels.fetch(id).catch(() => null);
  if (!(ch instanceof TextChannel) || ch.guildId !== guildId) return null;
  if (isTicketCategoryParentId(ch.parentId, ch.guildId)) {
    logger.warn(
      { guildId, type, channelId: ch.id, parentId: ch.parentId },
      "Configured channel is a ticket channel — automated post skipped",
    );
    return null;
  }
  return ch;
}

const leaderboardPublishLocks = new Map<string, Promise<Message | null>>();

function isManagedLeaderboardMessage(message: Message, type: LeaderboardFeedType): boolean {
  const titles = message.embeds
    .map((embed) => embed.title ?? "")
    .filter(Boolean);
  if (type === "eventTop") {
    return titles.some((title) =>
      title.includes("CLASAMENT EVENIMENT") ||
      title.includes("CRONICA SUPRAVIEȚUITORILOR"),
    );
  }
  return (
    titles.some((title) => title.includes("CLASAMENT FINAL")) ||
    message.content.includes("Prada ascunsă a Dragonului") ||
    message.content.includes("Prada de echipament a Dragonului")
  );
}

/**
 * Keeps one reusable result message in each leaderboard channel. On first use
 * after this change, it adopts the newest existing result message when possible;
 * subsequent event/boss results edit that message instead of adding more posts.
 */
export async function publishLeaderboardResult(
  client: Client,
  guildId: string,
  type: LeaderboardFeedType,
  payload: { embeds: EmbedBuilder[]; content?: string },
): Promise<Message | null> {
  const lockKey = `${guildId}:${type}`;
  const previous = leaderboardPublishLocks.get(lockKey) ?? Promise.resolve(null);
  const current = previous
    .catch(() => null)
    .then(async () => {
      const channel = await fetchChannel(client, type, guildId);
      if (!(channel instanceof TextChannel)) return null;

      const savedId = await loadLeaderboardMessageId(guildId, type).catch((err) => {
        logger.warn({ err, guildId, type }, "Could not load persistent leaderboard message");
        return null;
      });
      let message = savedId
        ? await channel.messages.fetch(savedId).catch(() => null)
        : null;

      if (!message) {
        const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        message = recent?.find((candidate) =>
          candidate.author.id === client.user?.id &&
          isManagedLeaderboardMessage(candidate, type),
        ) ?? null;
      }

      const messagePayload = {
        content: payload.content?.trim() || null,
        embeds: payload.embeds,
        components: [],
        allowedMentions: { parse: [] as never[] },
      };

      if (message) {
        const edited = await message.edit(messagePayload).catch((err) => {
          logger.warn({ err, guildId, type, messageId: message?.id }, "Could not edit leaderboard message");
          return null;
        });
        if (edited) {
          await saveLeaderboardMessageId(guildId, type, edited.id);
          return edited;
        }
      }

      const created = await channel.send({
        content: payload.content?.trim() || undefined,
        embeds: payload.embeds,
        allowedMentions: { parse: [] },
      });
      await saveLeaderboardMessageId(guildId, type, created.id);
      return created;
    });

  leaderboardPublishLocks.set(lockKey, current);
  try {
    return await current;
  } finally {
    if (leaderboardPublishLocks.get(lockKey) === current) {
      leaderboardPublishLocks.delete(lockKey);
    }
  }
}

// ─── Flee resolution ──────────────────────────────────────────────────────────

async function runFleeResolution(boss: BossState, client: Client): Promise<void> {
  try {
    const fightCh = await client.channels.fetch(boss.channelId).catch(() => null);
    if (fightCh instanceof TextChannel && fightCh.guildId === boss.guildId) {
      const bossMsg = await fightCh.messages.fetch(boss.messageId).catch(() => null);
      await bossMsg?.delete().catch(() => null);
    }
    const bossRewards = computeBossRewards(boss.damageBy, boss.rarity, boss.hitsBy, boss.veteranRank ?? 0);
    const gameplayConfig = getGameplayConfig(boss.guildId);
    const prestigeLevels = await getPrestigeLevels(boss.guildId, [...bossRewards.keys()]).catch(() => new Map<string, number>());
    for (const [discordId, r] of bossRewards) {
      // Pass guildId so the guild-wide admin boost applies here too, matching the boss-defeat path
      const rmods = getRewardMultipliers(discordId, boss.guildId);
      r.gold = Math.round(r.gold * gameplayConfig.economy.bossGoldMultiplier * rmods.goldMult * prestigeGoldMult(prestigeLevels.get(discordId) ?? 0));
      r.xp = Math.round(r.xp * gameplayConfig.economy.bossXpMultiplier * rmods.xpMult);
    }
    await Promise.all([...bossRewards.entries()].flatMap(([discordId, r]) => [
      addPlayerReputation(discordId, boss.guildId, r.rep),
      addPlayerGold(discordId, boss.guildId, r.gold),
      addPlayerXp(discordId, boss.guildId, r.xp),
    ]));
    const topCh = await fetchChannel(client, "bossTop", boss.guildId);
    if (topCh instanceof TextChannel) {
      const leaderboard = buildBossLeaderboard(boss, boss.damageBy, boss.participants, boss.playerNames, boss.playerHp, boss.hitsBy);
      await publishLeaderboardResult(client, boss.guildId, "bossTop", {
        embeds: [leaderboard],
      });
    }
  } catch { /* ignore */ }
}

// ─── Shared escape timer ──────────────────────────────────────────────────────

function scheduleEscapeTimer(boss: BossState, client: Client): ReturnType<typeof setTimeout> {
  const remaining = Math.max(1_000, boss.expiresAt - Date.now());
  const timer = setTimeout(async () => {
    if (boss.defeated) return;
    if (isGuildGameStopped(boss.guildId)) {
      scheduleEscapeTimer(boss, client);
      return;
    }
    boss.defeated = true;
    const gs = guildStates.get(boss.guildId);
    if (gs) {
      gs.activeBossMap.delete(boss.eventId);
      if (boss.standalone && gs.standaloneBossId === boss.eventId) gs.standaloneBossId = null;
    }
    await deleteActiveBoss(boss.eventId, boss.guildId).catch(() => null);
    await runFleeResolution(boss, client);
  }, remaining);
  timer.unref?.();
  return timer;
}

// ─── Startup rehydration ──────────────────────────────────────────────────────

async function rehydrateActiveBosses(client: Client, guildId: string): Promise<void> {
  try {
    await createActiveBossesTableIfNotExists();
    const rows = await loadActiveBossRowsByGuild(guildId);
    if (rows.length === 0) return;

    const now = Date.now();
    let loaded = 0;

    for (const row of rows) {
      const rowGuildId = guildId;
      if (row.expiresAt.getTime() <= now) {
        try {
          const expiredBoss = deserializeBoss(row.stateJson, rowGuildId);
          logger.info({ eventId: row.eventId, damageBy: expiredBoss.damageBy.size }, "Resolving flee for boss that expired during downtime");
          await runFleeResolution(expiredBoss, client);
        } catch (err) {
          logger.error({ err, eventId: row.eventId }, "Failed to resolve expired boss on startup — rewards may be lost");
        }
        await deleteActiveBoss(row.eventId, rowGuildId).catch(() => null);
        continue;
      }
      try {
        const boss = deserializeBoss(row.stateJson, rowGuildId);
        boss.defeated = false;
        const gs = getOrCreateGuildState(boss.guildId);
        gs.activeBossMap.set(boss.eventId, boss);
        if (boss.standalone) gs.standaloneBossId = boss.eventId;
        scheduleEscapeTimer(boss, client);
        loaded++;
        logger.info({ eventId: boss.eventId, guildId: boss.guildId, remainingMs: boss.expiresAt - now }, "Boss fight rehydrated from DB");
      } catch (err) {
        logger.error({ err, eventId: row.eventId }, "Failed to deserialize boss state — dropping row");
        await deleteActiveBoss(row.eventId, rowGuildId).catch(() => null);
      }
    }

    if (loaded > 0) {
      logger.info({ count: loaded }, "Active boss fights restored from DB");
    }
  } catch (err) {
    logger.error({ err }, "Failed to rehydrate active bosses on startup");
  }
}

// ─── Chest rehydration ────────────────────────────────────────────────────────

export async function rehydrateActiveChest(client: Client, guildId: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  try {
    const record = await loadActiveChest(guildId);
    if (!record) return;

    const now = Date.now();
    const ch = await client.channels.fetch(record.channelId).catch(() => null);
    if (!(ch instanceof TextChannel) || ch.guildId !== guildId) {
      await clearActiveChest(guildId).catch(() => null);
      logger.warn({ chestId: record.chestId, guildId }, "Chest channel not found on rehydration — row cleared");
      return;
    }

    const msg = await ch.messages.fetch(record.messageId).catch(() => null);
    const rarity = CHEST_RARITIES.find((r) => r.key === record.rarityKey) ?? CHEST_RARITIES[0]!;

    if (now >= record.expiresAt || !msg) {
      if (msg) {
        await deleteChestMessage(msg, { chestId: record.chestId, guildId, phase: "rehydrate-stale" });
      }
      gs.claimedChests.add(record.chestId);
      gs.lastChestMessageId = null;
      await clearActiveChest(guildId).catch(() => null);
      logger.info({ chestId: record.chestId, hadMessage: !!msg, guildId }, "Stale chest expired on bot restart");
      return;
    }

    gs.lastChestMessageId = record.messageId;
    const remaining = record.expiresAt - now;
    // Re-enable the full Cufere 2.0 choice row after a restart. The active
    // record contains the variant in new saves; old records fall back safely.
    await msg.edit({
      embeds: [buildChestEmbed(record.gold, rarity, record.mult, record.variant, record.expiresAt)],
      components: [buildChestRow(record.chestId, rarity, record.gold, record.mult)],
    }).catch(() => null);

    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(record.chestId)) {
        gs.claimedChests.add(record.chestId);
        await deleteChestMessage(msg, { chestId: record.chestId, guildId, phase: "rehydrate-expire" });
        logger.info({ chestId: record.chestId, guildId }, "Rehydrated chest expired unclaimed");
      }
      gs.lastChestMessageId = null;
      await clearActiveChest(guildId).catch(() => null);
    }, remaining);

    timeout.unref?.();
    gs.lastChestTimeout = timeout;

    logger.info({ chestId: record.chestId, remainingMs: remaining, guildId }, "Active chest rehydrated from DB");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to rehydrate active chest on startup");
  }
}

export async function rehydrateSimpleChest(client: Client, guildId: string, dbKey: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  try {
    const record = await loadActiveChest(guildId, dbKey);
    if (!record) return;

    const now = Date.now();
    const ch = await client.channels.fetch(record.channelId).catch(() => null);
    if (!(ch instanceof TextChannel) || ch.guildId !== guildId) {
      await clearActiveChest(guildId, dbKey).catch(() => null);
      logger.warn({ chestId: record.chestId, dbKey, guildId }, "Simple chest channel not found on rehydration — row cleared");
      return;
    }

    const msg = await ch.messages.fetch(record.messageId).catch(() => null);
    if (now >= record.expiresAt || !msg) {
      if (msg) {
        await deleteChestMessage(msg, { chestId: record.chestId, guildId, phase: `rehydrate-stale-${record.kind ?? dbKey}` });
      }
      gs.claimedChests.add(record.chestId);
      await clearActiveChest(guildId, dbKey).catch(() => null);
      logger.info({ chestId: record.chestId, dbKey, hadMessage: !!msg, guildId }, "Stale simple chest expired on bot restart");
      return;
    }

    const remaining = record.expiresAt - now;
    const timeout = setTimeout(async () => {
      if (!gs.claimedChests.has(record.chestId)) {
        gs.claimedChests.add(record.chestId);
        await deleteChestMessage(msg, { chestId: record.chestId, guildId, phase: `rehydrate-expire-${record.kind ?? dbKey}` });
        logger.info({ chestId: record.chestId, guildId }, "Rehydrated simple chest expired unclaimed");
      }
      await clearActiveChest(guildId, dbKey).catch(() => null);
    }, remaining);
    timeout.unref?.();

    logger.info({ chestId: record.chestId, dbKey, remainingMs: remaining, guildId }, "Simple chest rehydrated from DB");
  } catch (err) {
    logger.error({ err, dbKey, guildId }, "Failed to rehydrate simple chest on startup");
  }
}

// ─── Standalone boss ──────────────────────────────────────────────────────────

export async function fireStandaloneBoss(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  if (gs.standaloneBossId !== null && gs.activeBossMap.has(gs.standaloneBossId)) {
    logger.info({ standaloneBossId: gs.standaloneBossId, guildId }, "Standalone boss already active, skipping spawn");
    return;
  }

  try {
    const channel = await fetchChannel(client, "boss", guildId);
    if (!channel) {
      return;
    }

    const bossId = Date.now();
    const level = Math.floor(Math.random() * 21) + 10;
    const rarity = rollBossRarity();
    const kills = await getFinalBossKills(guildId).catch(() => 0);
    if (gs.stopped) return;
    const vRank = veteranRank(kills);
    const maxHp = Math.round(bossMaxHp(level, rarity) * veteranMult(vRank));
    const bossExpiresAt = Date.now() + getGameplayConfig(guildId).events.standaloneBossDurationMinutes * 60_000;

    const msg = await channel.send({
      embeds: [buildFinalBossEmbed(level, rarity, maxHp, maxHp, undefined, undefined, undefined, undefined, bossExpiresAt, 0, vRank)],
      components: [finalBossRow(bossId)],
    });
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return;
    }

    const boss: BossState = {
      eventId: bossId,
      guildId,
      level,
      rarity,
      maxHp,
      currentHp: maxHp,
      messageId: msg.id,
      channelId: channel.id,
      expiresAt: bossExpiresAt,
      standalone: true,
      lastHitAt: new Map(),
      damageBy: new Map(),
      hitsBy: new Map(),
      playerHp: new Map(),
      playerNames: new Map(),
      playerStats: new Map(),
      participants: [],
      abilityReadyAt: new Map(),
      empowerNext: new Set(),
      shieldNext: new Map(),
      defeated: false,
      charge: 0,
      veteranRank: vRank,
    };
    gs.activeBossMap.set(bossId, boss);
    gs.standaloneBossId = bossId;
    await persistBossState(boss);
    setOracleExtatic();
    scheduleEscapeTimer(boss, client);

    logger.info({ bossId, level, rarity, maxHp, veteranRank: vRank, guildId }, "Standalone boss summoned");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to summon standalone boss");
    const gs2 = guildStates.get(guildId);
    if (gs2) gs2.standaloneBossId = null;
  }
}

// ─── Locked chest ─────────────────────────────────────────────────────────────

export async function fireLockedChest(client: Client, guildId: string, rarityKey: string): Promise<void> {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return;

    const result = spawnLockedChest(rarityKey);
    if (!result) {
      logger.warn({ rarityKey, guildId }, "fireLockedChest: invalid rarity");
      return;
    }
    const { rarity, gold } = result;
    const chestId = `lockchest_${Date.now()}_${rarity.key}_${gold}`;
    const expiresAt = Date.now() + chestExpireMs(guildId);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Deschide cu Cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({
      content: `🔒 **Cufăr Blocat** apare în Regat! Cel cu cheia potrivită îl poate deschide!`,
       embeds: [buildLockedChestEmbed(rarity.key, gold, expiresAt)],
      components: [row],
    });
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return;
    }

    logger.info({ chestId, rarityKey: rarity.key, gold, guildId }, "Locked chest spawned");
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold, rarityKey: rarity.key, kind: "lockchest", expiresAt }, LOCKCHEST_DBKEY).catch(() => null);

    const timeout = setTimeout(async () => {
      if (gs.claimedChests.has(chestId)) return;
      gs.claimedChests.add(chestId);
      await deleteChestMessage(msg, { chestId, guildId, phase: "expire-locked" });
      logger.info({ chestId, guildId }, "Locked chest expired unclaimed");
      void clearActiveChest(guildId, LOCKCHEST_DBKEY).catch(() => null);
    }, chestExpireMs(guildId));
    timeout.unref?.();
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire locked chest");
  }
}

// ─── Key chest ────────────────────────────────────────────────────────────────

export async function fireKeyChest(client: Client, guildId: string, keyType?: string, bypassGate = false): Promise<{ chestId: string } | null> {
  const gs = getOrCreateGuildState(guildId);
  if (gs.stopped) return null;
  if (gs.firingKeyChest) {
    logger.warn({ guildId }, "fireKeyChest already in progress, skipping duplicate trigger");
    return null;
  }
  if (!bypassGate && !isGuildActive(gs.lastActivityAt, ACTIVITY_WINDOW_MS)) {
    logger.debug({ guildId, lastActivityAt: gs.lastActivityAt, windowMinutes: ACTIVITY_WINDOW_MINUTES }, "Key-chest spawn skipped — no recent chat activity");
    return null;
  }
  gs.firingKeyChest = true;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return null;

    const kt = keyType && keyType !== "random" ? keyType : rollKeyChestType();
    const chestId = `keychest_${Date.now()}_${kt}`;
    const expiresAt = Date.now() + chestExpireMs(guildId);

    const lockedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("⏳ Disponibil în 5 secunde…")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(chestId)
        .setLabel("🗝️ Ia cheia")
        .setStyle(ButtonStyle.Primary),
    );

    const frames: Array<{ content: string; delay: number }> = [
      { content: "🌫️ *Ceva metalic zornăie în cenușă…*", delay: 800 },
      { content: "🗝️✨ *O cheie a fost găsită în umbre!*", delay: 900 },
    ];

    const msg = await channel.send({ content: frames[0]!.content });
    for (let i = 1; i < frames.length; i++) {
      await sleep(frames[i - 1]!.delay);
      if (gs.stopped) {
        await msg.delete().catch(() => null);
        return null;
      }
      await msg.edit({ content: frames[i]!.content }).catch(() => null);
    }
    await sleep(frames[frames.length - 1]!.delay);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    await msg.edit({ content: "", embeds: [buildKeyChestEmbed(kt)], components: [lockedRow] }).catch(() => null);

    await sleep(5000);
    if (gs.stopped) {
      await msg.delete().catch(() => null);
      return null;
    }
    if (!gs.claimedChests.has(chestId)) {
      await msg.edit({ embeds: [buildKeyChestEmbed(kt)], components: [row] }).catch(() => null);
    }

    logger.info({ chestId, keyType: kt, guildId }, "Key chest spawned");
    void persistActiveChest(guildId, { messageId: msg.id, channelId: channel.id, chestId, gold: 0, rarityKey: kt, keyType: kt, kind: "keychest", expiresAt }, KEYCHEST_DBKEY).catch(() => null);

    const timeout = setTimeout(async () => {
      if (gs.claimedChests.has(chestId)) return;
      gs.claimedChests.add(chestId);
      await deleteChestMessage(msg, { chestId, guildId, phase: "expire-key" });
      logger.info({ chestId, guildId }, "Key chest expired unclaimed");
      void clearActiveChest(guildId, KEYCHEST_DBKEY).catch(() => null);
    }, chestExpireMs(guildId));
    timeout.unref?.();

    return { chestId };
  } catch (err) {
    logger.error({ err, guildId }, "Failed to fire key chest");
    return null;
  } finally {
    gs.firingKeyChest = false;
  }
}

// ─── Oracle / battle event ────────────────────────────────────────────────────

async function fireOracle(client: Client, guildId: string) {
  if (isGuildGameStopped(guildId)) return;
  try {
    const channel = await fetchChannel(client, "main", guildId);
    if (!channel) return;
    await channel.send({ content: oracleMessage() });
  } catch (err) {
    logger.error({ err, guildId }, "Failed to send oracle message");
  }
}

async function fireBattleEvent(client: Client, guildId: string) {
  if (isGuildGameStopped(guildId)) return;
  try {
    const ev = await getLatestActiveEvent(guildId);
    if (!ev) return;
    const channel = await fetchChannel(client, "event", guildId);
    if (!channel) return;
    const battle = triggerRandomBattleEvent();
    const sent = await channel.send({ content: battle.announce });
    const ttl = Math.max(0, battle.expiresAt - Date.now());
    setTimeout(() => { void sent.delete().catch(() => {}); }, ttl);
    logger.info({ eventId: ev.id, battle: battle.key, guildId }, "Battle event triggered");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to trigger battle event");
  }
}

// ─── Per-guild scheduler startup ──────────────────────────────────────────────

export function startGuildScheduler(client: Client, guildId: string) {
  const gs = getOrCreateGuildState(guildId);
  // Daily statistics are observational and should continue even when gameplay
  // is paused; they are not part of the gameplay scheduler below.
  startDailyStatsScheduler(client, guildId);
  if (isGameplayPaused(guildId)) {
    gs.stopped = true;
    gs.started = false;
    setTributeGamePaused(guildId, true);
    logger.info({ guildId }, "Guild scheduler remains paused by configuration");
    return;
  }
  if (gs.started) {
    logger.info({ guildId }, "Guild scheduler already running — skipping re-init");
    return;
  }
  gs.stopped = false; // reset in case the bot had previously left and rejoined this guild
  gs.started = true;
  gs.runGeneration += 1;
  const runGeneration = gs.runGeneration;
  setTributeGamePaused(guildId, false);

  void rehydrateCouncilDecree(guildId).catch((err) =>
    logger.warn({ err, guildId }, "Council decree could not be rehydrated"),
  );
  void rehydrateEventMessageDeletions(client, guildId);
  void expireOldEvents(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to expire events after scheduler start"),
  );
  void rehydrateActiveBosses(client, guildId);
  if (LEGACY_CHEST_SPAWNS_ENABLED) {
    void rehydrateActiveChest(client, guildId);
    void rehydrateSimpleChest(client, guildId, KEYCHEST_DBKEY);
    void rehydrateSimpleChest(client, guildId, LOCKCHEST_DBKEY);
  }
  void rehydrateSeasonalChest(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to rehydrate seasonal chest"),
  );
  void (rehydrateHiddenChest?.(client, guildId) ?? Promise.resolve()).catch((err) =>
    logger.warn({ err, guildId }, "Failed to rehydrate hidden chest"),
  );
  void rehydrateFratiaVote(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to rehydrate Frăția vote"),
  );

  const isStopped = () => {
    const current = guildStates.get(guildId);
    return current?.stopped === true || current?.runGeneration !== runGeneration || isGameplayPaused(guildId);
  };

  setInterval(() => { if (!isStopped()) void expireOldEvents(client, guildId); }, 60 * 1000);
  setInterval(() => {
    if (!isStopped()) {
      void settleExpiredAuction(guildId).catch((err) =>
        logger.warn({ err, guildId }, "Failed to settle expired auction"),
      );
    }
  }, 60 * 1000);

  const scheduleNext = () => {
    if (isStopped()) return;
     const cooldown = randomCooldown(guildId);
    logger.info({ nextInHours: (cooldown / 3600000).toFixed(2), guildId }, "Next event scheduled");
    setTimeout(async () => { if (!isStopped()) { await fireEvent(client, guildId); scheduleNext(); } }, cooldown);
  };

  setTimeout(async () => { if (!isStopped()) { await fireEvent(client, guildId); scheduleNext(); } }, 5 * 60 * 1000);
  logger.info({ guildId }, "First Ora Umbrelor in 5 minutes");

  if (LEGACY_CHEST_SPAWNS_ENABLED) {
     const scheduleChest = () => {
       if (isStopped()) return;
       const delay = getGameplayConfig(guildId).events.chestIntervalMinutes * 60_000;
       const timer = setTimeout(() => {
         if (!isStopped()) void fireChest(client, guildId, true);
         scheduleChest();
       }, delay);
       timer.unref?.();
     };
     scheduleChest();
     logger.info({ guildId }, "Classic chest scheduler started");
  }
  logger.info({ everyMessages: SEASONAL_CHEST_MSG_MILESTONE, guildId }, "Seasonal chest scheduler started — message milestone");

  // Oracle messages disabled — user requested only chest in chat
  // setInterval(() => { void fireOracle(client, guildId); }, ORACLE_INTERVAL_MS);

   const scheduleBattleEvent = () => {
     if (isStopped()) return;
     const delay = getGameplayConfig(guildId).events.battleEventIntervalMinutes * 60_000;
     const timer = setTimeout(() => {
       if (!isStopped()) void fireBattleEvent(client, guildId);
       scheduleBattleEvent();
     }, delay);
     timer.unref?.();
   };
   scheduleBattleEvent();
   logger.info({ guildId }, "Battle-event scheduler started");

  const scheduleNextStandaloneBoss = () => {
    if (isStopped()) return;
     const { standaloneBossIntervalMinMinutes, standaloneBossIntervalMaxMinutes } = getGameplayConfig(guildId).events;
     const min = standaloneBossIntervalMinMinutes * 60_000;
     const max = standaloneBossIntervalMaxMinutes * 60_000;
     const delay = min + Math.floor(Math.random() * (Math.max(min, max) - min + 1));
    const t = setTimeout(async () => {
      if (!isStopped()) { await fireStandaloneBoss(client, guildId); scheduleNextStandaloneBoss(); }
    }, delay);
    t.unref?.();
    logger.info({ nextInMinutes: (delay / 60_000).toFixed(1), guildId }, "Next standalone boss scheduled");
  };
  scheduleNextStandaloneBoss();

  if (!hasAnyChannelConfigured(guildId)) {
    logger.warn(
      { guildId },
      "Guild has no channel config — scheduled events will be skipped on each tick until /setcanal is run by a server admin",
    );
  }

  void startTributeScheduler(client, guildId).catch((err) =>
    logger.warn({ err, guildId }, "Failed to start Tributul Regatului scheduler"),
  );

  const oracleChannelId = getChannel("main", guildId);
  const councilChannelId = getChannel("council", guildId) ?? oracleChannelId;
  if (oracleChannelId) {
    startOracle(client, oracleChannelId, guildId);
  }
  if (councilChannelId) {
    startOracleCouncilScheduler(client, guildId, councilChannelId);
  }
}

export { APPLICATION_ID };

function finalBossDurationMs(guildId: string): number {
  return getGameplayConfig(guildId).events.finalBossDurationMinutes * 60_000;
}

function chestExpireMs(guildId: string): number {
  return getGameplayConfig(guildId).events.chestExpireMinutes * 60_000;
}
