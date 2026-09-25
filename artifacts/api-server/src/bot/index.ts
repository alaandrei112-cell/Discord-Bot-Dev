import {
  Client,
  Guild,
  TextChannel,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  MessageFlags,
  ActivityType,
  ButtonInteraction,
  type Message,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { sendAlert, sendRecoveryAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./alert";
import { startGuildScheduler, stopGuildScheduler, APPLICATION_ID, fireEvent, fireChest, fireChestForced, fireFinalBoss, fireLockedChest, fireKeyChest, recordGuildActivity, getGuildClaimedChests, getGuildActiveBossMap, isGuildGameStopped, checkBossEligibility, checkBossHitCooldown, BOSS_HIT_COOLDOWN_MS, persistBossState, publishLeaderboardResult, guildStates, isGuildActive, ACTIVITY_WINDOW_MINUTES, CHEST_MSG_MILESTONE, type BossState, type BossPlayerStats } from "./scheduler";
import { getChannel, getAllChannels, setChannel, initChannelConfig, hasAnyChannelConfigured, EVENT_LABELS, type EventType } from "./channel-config";
import { getGameplayConfig, initGameplayConfig, setGameplayPaused } from "./gameplay-store";
import { sendAiMemberMessage } from "./member-messages";
import { messageWithImage } from "./message-media";
import {
  recordMessage,
  refreshOraclePresence,
  getCurrentMood,
  resumeOracle,
  startOracle,
  stopOracle,
  isOracleEnabled,
} from "./oracle";
import {
  maybeReplyAsOracle,
  logOracleChatStatus,
  generatePersonalProphecy,
  generateChestInscription,
  answerHelpQuestion,
  announceOracleRelationshipChange,
  ORACLE_HOSTILE_RELATION_DELTA,
  ORACLE_HIGH_RELATION_THRESHOLD,
  recordOracleRelationshipChange,
  prophecyCooldownRemaining,
  reserveProphecy,
  getOracleTicketKindFromParentId,
} from "./oracle-chat";
import {
  handleTicketButton,
  handleTicketModal,
  handleTicketQuestionModal,
  handleTicketQuestionSelect,
  postTicketPanelIfMissing,
  scheduleIncompleteTicketDeletion,
  allianceRecruitmentTextModal,
  DEFAULT_ALLIANCE_RECRUITMENT_TEXT,
} from "./ticket-ui";
import {
  handleOracleCouncilVote,
  isOracleCouncilButton,
  startOracleCouncilScheduler,
  stopOracleCouncilScheduler,
} from "./oracle-council";
import { initTicketConfig, isTicketCategoryParentId } from "./ticket-categories";
import {
  enforceOracleTimeout,
  handleToxicity,
  restoreOracleTimeouts,
  setOracleTimeoutPersistence,
  setOracleToxicityRelationshipHandler,
} from "./oracle-guard";
import { moderationCommands, handleModerationCommand } from "./moderation/commands";
import { attachModeration, getConfig as getModerationConfig, handleModerationMessage } from "./moderation/engine";
import { syncNativeAutoMod } from "./native-automod";
import { setModerationClient } from "../moderation/auth";
import { getVerificationWebsiteUrl } from "../moderation/oauth";
import { handleVerificationButton } from "./verification";
import { getRewardMultipliers, getCombatModifiers, formatActiveEffects, formatCombatEffects, rollChestEffectKind, grantRandomBlessing, grantRandomCurse, buildChestEffectMessage } from "./status-effects";
import {
  recordDailyBoost,
  recordDailyJoin,
  recordDailyLeave,
  recordDailyMessage,
  recordDailyVoicePeak,
} from "./daily-stats";
import { loadInviteTrackingConfig } from "./db";
import {
  applyInviteTrackingConfig,
  queueInviteJoin,
  recordCreatedInvite,
  recordDeletedInvite,
  stopInviteTracking,
} from "./invite-stats";
import { SUPER_ADMIN_ID } from "./constants";
import {
  ensureTributePlayer,
  fireTribute,
  handleTributeContribution,
  restartTributeScheduler,
  saveTributeConfig,
} from "./tribute";
import {
  upsertPlayer,
  joinEvent,
  getParticipant,
  updateParticipant,
  getActiveEvent,
  addPlayerXp,
  addPlayerGold,
  addPlayerReputation,
  deductPlayerGold,
  deductPlayerXp,
  buyPlayerUpgrade,
  applyUpgradeToActiveParticipant,
  getTopPlayers,
  getGlobalTopPlayers,
  getServerRanking,
  type ServerRankRow,
  recordPlayerDeath,
  recordPlayerRetreat,
  getPlayerById,
  getPlayerKeys,
  updateMaxLevel,
  setPlayerClass,
  resetPlayerClass,
  resetPlayerCompanion,
  buyCompanion,
  upgradeCompanion,
  buyClassPower,
  upgradeClassPower,
  spendPlayerMana,
  drainPlayerMana,
  regenPlayerMana,
  upgradeMana,
  upgradeManaRegen,
  applyClassPowerLevelToActiveParticipant,
  addPlayerKey,
  consumePlayerKey,
  combinePlayerKeys,
  deleteActiveBoss,
  clearActiveChest,
  KEYCHEST_DBKEY,
  LOCKCHEST_DBKEY,
  saveTraderMessageId,
  loadTraderMessageId,
  clearTraderMessageId,
  saveTraderEmbedSig,
  loadTraderEmbedSig,
  saveAllianceRecruitmentText,
  loadAllianceRecruitmentText,
  ensureBotStateTable,
  saveOracleTimeoutLock,
  deleteOracleTimeoutLock,
  loadOracleTimeoutLocks,
  claimBotInstance,
  getBotInstanceHolder,
  runMultiGuildMigrations,
  resetPlayer,
  resetAllPlayersInGuild,
  buyPrestige,
  prestigeXpCost,
  getPrestigeLevels,
  equipTalisman,
  tryUpgradeTalismanLevel,
  tryDeductPlayerGold,
  getPlayerTalismans,
  saveTalismanLevel,
  getPlayerItems,
  upgradeClass,
  buyEquipment,
  upgradeEquipment,
  equipEquipment,
  grantEquipment,
  addPlayerItem,
  consumePlayerItems,
  advanceChestPity,
  getDailyQuestRows,
  incrementDailyQuest,
  incrementBossKill,
  incrementFinalBossKills,
  getFinalBossKills,
  todayDateUTC,
  type KeyType,
} from "./db";
import {
  doCombat,
  buildCombatEmbed,
  buildResultText,
  buildDeathEmbed,
  buildRetreatEmbed,
  prestigeGoldMult,
  buildShopEmbed,
  buildLevelupEmbed,
  buildProfileEmbed,
  buildClassEmbed,
  classRows,
  buildCompanionEmbed,
  isCompanionKey,
  companionStats,
  combatRow,
  shopRows,
  shopStatsRows,
  shopCompRows,
  shopAbilRows,
  shopPrestigeRows,
  shopClassRows,
  levelupRows,
  shopPrice,
  monsterMaxHp,
  monsterSpawnHp,
  isBossFight,
  levelTitle,
  CLASSES,
  COMPANIONS,
  isClassKey,
  classStats,
  classUpgradeCost,
  classPowerFor,
  classPowerLevel,
  isClassPowerSlot,
  type ClassPowerSlot,
  upgradeCost,
  COMPANION_BUY_COST,
  CLASS_SWITCH_COST,
  ABILITY_BUY_COST,
  UPGRADE_XP_COST,
  SHOP_COUNT_KEY,
  LEVELUP_INTERVAL,
  maxMana,
  abilityManaCost,
  manaRegenPerAttack,
  manaRegenPct,
  manaRegenUpgradeCost,
  manaUpgradeCost,
  manaBar,
  shieldManaDrain,
  shieldManaDrainPct,
  shieldMaxHp,
  empowerMult,
  shieldReduction,
  SHIELD_ACTIVATION_COST,
  shieldBar,
  buildHpBar,
  veteranMult,
  buildFinalBossEmbed,
  buildBossLeaderboard,
  BOSSES,
  bossIndex,
  FINAL_BOSS_CHARGE_MAX,
  buildLockedChestEmbed,
  buildKeyDropMessage,
  LOCKED_CHEST_GOLD,
  spawnLockedChest,
  rollChest,
  rollChestMultiplier,
  computeBossRewards,
  finalBossVeteranCapLine,
  finalBossRow,
  CHEST_RARITIES,
  KEY_DROP,
  CHEST_KEY_REQUIRED,
  KEY_LABEL,
  KEY_SOURCE_LABEL,
  KEY_EMOJI,
  buildKeyChestClaimMessage,
  rollEventKeyDrops,
  THEME_COLOR,
  BRAND_FOOTER,
  buildTalismanPage,
  shopTalismanRows,
  shopNavRow2,
  shopEquipmentRows,
  shopEquipmentDetailRows,
  buildEquipmentDetailEmbed,
  buildInventoryEmbeds,
  inventoryRows,
  buildEquipmentLootEmbed,
  TALISMANS,
  talismanValue,
  talismanUpgradeCost,
  ITEMS,
  DAILY_QUESTS,
  isTalismanKey,
  isItemKey,
  rollItemDrop,
  rollMaterialDrop,
  rollEquipmentMaterialDrop,
  rollEquipmentDrop,
  EQUIPMENT,
  equipmentCost,
  equipmentLevel,
  equipmentStats,
  isEquipmentKey,
  type EquipmentKey,
  buildMissionEmbed,
  dailyQuestDefinitions,
  type DailyQuestKey,
  type DailyQuestRowLike,
  type ShopKey,
  type BossRarity,
} from "./survival";
import { IMG } from "./assets";
import {
  buildPersonalChestEmbed,
  claimPersonalChest,
  getPersonalActivity,
  personalChestReward,
  personalChestRow,
  buildFratiaVoteEmbed,
  castFratiaVote,
  fratiaVoteRows,
  loadFratiaVote,
  buildSeasonalChestEmbed,
  seasonalChestRow,
  claimSeasonalChest,
  getSeasonalChest,
  scheduleSeasonalChestMessageDeletion,
  SEASONAL_CHESTS,
  buildHiddenChestEmbed,
  claimHiddenChest,
  hiddenChestRow,
  scheduleHiddenChestMessageDeletion,
  getAuction,
  attachAuctionMessage,
  buildAuctionEmbed,
  auctionRow,
  placeAuctionBid,
  exchangeDuplicateRelic,
  corruptedKeyEmbed,
  purifyCorruptedKey,
  randomCorruptedKeyDrop,
  recordPersonalActivity,
  maybeHandleOracleClue,
} from "./chest-expansions";

const DEFAULT_GUILD_ID = "1382035307607883816";

let botClient: Client | null = null;

/** Disconnect the Discord client promptly — used by the SIGTERM/SIGINT handler
 *  so a redeploy never leaves a zombie gateway session behind. */
export async function destroyBotClientForShutdown(): Promise<void> {
  const c = botClient;
  botClient = null;
  setModerationClient(null);
  if (c) await c.destroy();
}

let disconnectAlertTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectStartedAt: Date | null = null;
let botReadyAt: Date | null = null;
let shardStatus: string = "disconnected";

// ── Per-guild trader state ───────────────────────────────────────────────────
const TRADER_SUCCESS_CHANCE  = 0.30;

const TRADER_OFFERS: Array<{ rarityKey: string; keyType: KeyType; label: string; emoji: string }> = [
  { rarityKey: "argint", keyType: "rar",   label: "Cufărul Cenușii",       emoji: "⚙️" },
  { rarityKey: "aur",    keyType: "epic",  label: "Cufărul Nocturn",       emoji: "🌑" },
  { rarityKey: "mitic",  keyType: "regal", label: "Cufărul Oaselor",       emoji: "💀" },
  { rarityKey: "regal",  keyType: "oase",  label: "Cufărul Fumului",       emoji: "🌀" },
  { rarityKey: "cavaler", keyType: "fum",  label: "Cufărul Cavalerului",   emoji: "🛡️" },
];

const traderMessageIds = new Map<string, string | null>();
const traderSetupInProgress = new Map<string, boolean>();

function getTraderMessageId(guildId: string): string | null {
  return traderMessageIds.get(guildId) ?? null;
}
function setTraderMessageId(guildId: string, id: string | null) {
  traderMessageIds.set(guildId, id);
}
function isTraderSetupInProgress(guildId: string): boolean {
  return traderSetupInProgress.get(guildId) ?? false;
}

// De-dup recently handled interaction IDs
const seenInteractionIds = new Set<string>();
const INTERACTION_DEDUP_TTL_MS = 17 * 60 * 1000;

// ── Single-instance guard ─────────────────────────────────────────────────────
// How often a running instance re-checks the bot_instance marker in the DB.
const INSTANCE_WATCHDOG_INTERVAL_MS = 60_000;

/**
 * True when the bot_instance marker in the DB belongs to ANOTHER process,
 * meaning a newer instance claimed leadership and this one must yield.
 * A null holder (row missing / never claimed) never triggers a yield.
 */
export function shouldYieldLeadership(holder: string | null, instanceId: string): boolean {
  return holder != null && holder !== instanceId;
}

let privilegedIntentFellBack = false;

async function markOracleFellBack(): Promise<void> {
  try {
    const { recordOracleFellBack } = await import("./db");
    await recordOracleFellBack();
  } catch (err) {
    logger.warn({ err }, "Could not persist Oracle fallback marker — the recovery alert may not fire after restart");
  }
}

async function consumeOracleFellBackMarker(): Promise<boolean> {
  try {
    const { consumeOracleFellBack } = await import("./db");
    return await consumeOracleFellBack();
  } catch (err) {
    logger.warn({ err }, "Could not read/clear the Oracle fallback marker after recovery");
    return false;
  }
}

async function sendOnboardingMessage(guild: Guild): Promise<void> {
  const message =
    "👋 **Bun venit în Regatul Cenușii!**\n\n" +
    "Botul a fost adăugat pe serverul tău, dar **nu are canalele configurate** încă.\n" +
    "Folosește comanda `/setcanal` pentru a configura canalele unde botul va posta:\n\n" +
    "📺 **Cufere și Oracol** — cufere, chei și mesaje Oracol\n" +
    "🔥 **Ora Umbrelor** — evenimentele principale de luptă\n" +
    "🐉 **Dragonul Stins** — boss final\n" +
    "🏺 **Negustorul** — magazinul permanent\n" +
    "🏆 **Top Ora Umbrelor** — clasamentul evenimentelor\n" +
    "🏆 **Top Dragonul Stins** — clasamentul boss-urilor\n\n" +
    "Folosește din nou `/setcanal` pentru a schimba canalul unei categorii.";

  try {
    const ownerMember = await guild.fetchOwner().catch(() => null);
    if (ownerMember) {
      await ownerMember.user.send({ content: message });
      logger.info({ guildId: guild.id }, "Sent onboarding DM to guild owner");
      return;
    }
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Could not DM guild owner — trying system channel");
  }

  const systemChannel = guild.systemChannel;
  if (systemChannel) {
    try {
      await systemChannel.send({ content: message });
      logger.info({ guildId: guild.id }, "Sent onboarding message to system channel");
      return;
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "Could not post onboarding message in system channel");
    }
  }

  logger.warn({ guildId: guild.id }, "No DM or system channel available — onboarding message not delivered");
}

export async function maybeAlertOracleRecovery(
  getMode: () => OracleReplyMode,
  consumeMarker: () => Promise<boolean>,
  alert: (msg: string) => Promise<unknown>,
): Promise<void> {
  if (getMode().mode !== "full") return;
  if (!(await consumeMarker())) return;
  logger.info("Oracle recovered to full-reply mode after a prior fallback — sending recovery alert");
  await alert(
    "\u2705 **Oracolul r\u0103spunde din nou la fiecare reply.**\n" +
      "Inten\u021bia privilegiat\u0103 \u201eMessage Content\u201d este activ\u0103 \u2014 Oracolul a revenit la modul complet \u0219i r\u0103spunde acum la toate mesajele, nu doar la @mention \u0219i reply-uri cu ping.",
  );
}

export function isBotOnline(): boolean {
  return botClient !== null && botClient.isReady();
}

export function getBotReadyAt(): Date | null {
  return botReadyAt;
}

export function getShardStatus(): string {
  return shardStatus;
}

export type OracleReplyMode = {
  mode: "full" | "degraded";
  reason: "active" | "disabled" | "portal_toggle_missing";
};

export function getOracleReplyMode(): OracleReplyMode {
  const enabled = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";
  if (!enabled) return { mode: "degraded", reason: "disabled" };
  if (privilegedIntentFellBack) return { mode: "degraded", reason: "portal_toggle_missing" };
  return { mode: "full", reason: "active" };
}

export function getBotClient(): Client | null {
  return botClient;
}

export { DEFAULT_GUILD_ID as GUILD_ID };

const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4013, 4014]);

function isDisallowedIntentError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === 4014 || e.code === "DisallowedIntents") return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return msg.includes("disallowed intent") || msg.includes("privileged intent");
}

const slashCommands = [
  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("📜 Statisticile tale din Regatul Cenușii.")
    .addUserOption((opt) =>
      opt.setName("jucator").setDescription("Vezi profilul altui luptător (opțional).").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("profetie")
    .setDescription("🔮 Primește o profeție personalizată de la Oracolul Cenușii."),
  new SlashCommandBuilder()
    .setName("clasament")
    .setDescription("👑 Clasamentele Regatelor Cenușii.")
    .addSubcommand((sub) =>
      sub.setName("server").setDescription("Top 10 luptători pe serverul curent."),
    )
    .addSubcommand((sub) =>
      sub.setName("global").setDescription("Top 10 luptători din toate serverele."),
    )
    .addSubcommand((sub) =>
      sub.setName("servere").setDescription("🏆 Clasamentul regatelor — cele mai puternice servere."),
    ),
  new SlashCommandBuilder().setName("magazin").setDescription("🏺 Forja Cenușii — îmbunătățiri permanente, mereu disponibilă."),
  new SlashCommandBuilder().setName("inventar").setDescription("🎒 Vezi armele, armurile și materialele tale."),
  new SlashCommandBuilder().setName("clasa").setDescription("🧬 Alege-ți clasa RPG (o poți reseta din /magazin)."),
  new SlashCommandBuilder().setName("companion").setDescription("🐾 Vezi companionul tău (cumpără și fă îmbunătățiri din /magazin)."),
  new SlashCommandBuilder().setName("ajutor").setDescription("❓ Ghidul comenzilor din Regatul Cenușii."),
  new SlashCommandBuilder().setName("misiuni").setDescription("📜 Misiunea ta zilnică — progres și recompensă."),
  new SlashCommandBuilder().setName("cufarpersonal").setDescription("🕯️ Vezi și revendică Cufărul Vegherii Zilnice."),
  new SlashCommandBuilder().setName("fratie").setDescription("🤝 Vezi votul curent al Chivotului Frăției."),
  new SlashCommandBuilder()
    .setName("licitatie")
    .setDescription("⚒️ Vezi Târgul Negru și licitează pentru oferta curentă.")
    .addIntegerOption((opt) =>
      opt.setName("suma").setDescription("Oferta ta în Oboli (opțional)").setMinValue(1).setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("posteazalicitatie")
    .setDescription("📣 [Admin] Publică licitația curentă într-un canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt.setName("canal")
        .setDescription("Canalul text în care va fi publicată licitația")
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName("schimbrelicve").setDescription("💎 Schimbă două fragmente duplicate într-un fragment rar."),
  new SlashCommandBuilder().setName("purificacheie").setDescription("🧪 Purifică Cheia Pângărită cu 3 Fragmente de Cenușă."),
  new SlashCommandBuilder()
    .setName("chei")
    .setDescription("🗝️ Vezi cheile și forjează 3 chei într-una de nivel superior.")
    .addStringOption((opt) =>
      opt.setName("combina")
        .setDescription("Forjează 3 chei de un nivel într-una de nivel superior")
        .setRequired(false)
        .addChoices(
          { name: "3 Umbre Frânte → 1 Cenușii Regale", value: "rar" },
          { name: "3 Cenușii Regale → 1 Nocturnă", value: "epic" },
          { name: "3 Nocturne → 1 Oaselor Tăcute", value: "regal" },
          { name: "3 Oaselor Tăcute → 1 Fum Înghețat", value: "oase" },
          { name: "3 Fumuri Înghețate → 1 Cavaler Cenușiu", value: "fum" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("setcanal")
    .setDescription("📺 [Admin] Alege canalul pentru fiecare tip de activitate.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName("tip")
        .setDescription("Ce activitate va fi publicată în canal")
        .setRequired(true)
        .addChoices(
          { name: "Cufere și Oracol", value: "main" },
          { name: "Ora Umbrelor", value: "event" },
          { name: "Dragonul Stins", value: "boss" },
          { name: "Negustorul (Forja Cenușii)", value: "trader" },
          { name: "Top Ora Umbrelor", value: "eventTop" },
          { name: "Top Dragonul Stins", value: "bossTop" },
          { name: "Consiliul Umbrelor", value: "council" },
          { name: "Chivotul Frăției", value: "fratia" },
          { name: "Tributul Regatului", value: "tribut" },
        ),
    )
    .addChannelOption((opt) =>
      opt.setName("canal")
        .setDescription("Canalul text în care va fi publicată activitatea")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("setaliantatext")
    .setDescription("🤝 [Admin] Modifică textul publicat când este confirmată o alianță.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("stopjoc")
    .setDescription("⏸️ [Admin] Oprește toate activitățile automate ale jocului pe acest server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("startjoc")
    .setDescription("▶️ [Admin] Repornește toate activitățile automate ale jocului pe acest server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("stopai")
    .setDescription("🛑 [Admin] Oprește răspunsurile și activitatea automată a Oracolului.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("startai")
    .setDescription("✨ [Admin] Repornește răspunsurile și activitatea automată a Oracolului.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function avatarById(discordId: string): Promise<string | null> {
  if (!botClient) return null;
  const cached = botClient.users.cache.get(discordId);
  if (cached) return cached.displayAvatarURL({ size: 256 });
  const u = await Promise.race([
    botClient.users.fetch(discordId).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 1500)),
  ]);
  return u ? u.displayAvatarURL({ size: 256 }) : null;
}

async function handleProfil(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const target = interaction.options.getUser("jucator");
  if (target && target.id !== interaction.user.id) {
    const [player, items] = await Promise.all([
      getPlayerById(target.id, guildId),
      getPlayerItems(target.id, guildId),
    ]);
    if (!player) {
      await interaction.editReply({
        content: `❌ **${target.username}** nu a pășit încă în Regatul Cenușii — nu există un profil pentru acest jucător.`,
      });
      return;
    }
    await interaction.editReply({
      embeds: [buildProfileEmbed(player, undefined, target.displayAvatarURL({ size: 256 }), items)],
    });
    return;
  }
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({
    embeds: [buildProfileEmbed(p, undefined, interaction.user.displayAvatarURL({ size: 256 }), items)],
  });
}

async function handleInventar(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const [player, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({
    embeds: buildInventoryEmbeds(player, items),
    components: inventoryRows(player),
  });
}

async function handleProfetie(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!isOracleEnabled(interaction.guildId!)) {
    const messages = getGameplayConfig(interaction.guildId ?? "").messages;
    await interaction.editReply(messageWithImage(messages.oraclePaused, messages.oraclePausedImageUrl, messages.oraclePausedThumbnailUrl));
    return;
  }
  const userId = interaction.user.id;
  const remaining = prophecyCooldownRemaining(userId);
  if (remaining > 0) {
    const minutes = Math.ceil(remaining / 60_000);
    await interaction.editReply(
      `🔮 Cenușa încă îți descifrează soarta. Încearcă din nou peste aproximativ ${minutes} minut${minutes === 1 ? "" : "e"}.`,
    );
    return;
  }
  if (!reserveProphecy(userId)) {
    await interaction.editReply("🔮 O altă profeție se țese deja pentru tine. Mai așteaptă puțin.");
    return;
  }

  const player = await upsertPlayer(interaction.user.id, interaction.guildId!, interaction.user.username);
  const prophecy = await generatePersonalProphecy(player, getCurrentMood(interaction.guildId!)).catch((err) => {
    logger.warn({ err, userId }, "Personal prophecy generation failed");
    return null;
  });
  if (!prophecy) {
    await interaction.editReply(
      "🕯️ *Cerneala destinului s-a stins. Oracolul nu poate rosti acum o profeție.*",
    );
    return;
  }

  const relationTitle = player.oracleTitle ?? "Suflet necunoscut";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle("🔮 Profeția ta din Cenușă")
        .setDescription(`*${prophecy}*`)
        .setFooter({ text: `Legătura cu Oracolul: ${relationTitle} · Profeție cosmetică` })
        .setTimestamp(),
    ],
  });
}

type HelpCategory = "profil" | "lupta" | "economie" | "cufere" | "evenimente" | "oracol" | "comenzi";

const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  profil: "📜 Profil",
  lupta: "⚔️ Luptă",
  economie: "🏺 Economie",
  cufere: "🗝️ Cufere",
  evenimente: "🔥 Evenimente",
  oracol: "🔮 Oracol",
  comenzi: "🛠️ Comenzi",
};

function buildHelpEmbed(category: HelpCategory) {
  const pages: Record<HelpCategory, { title: string; description: string; fields: Array<{ name: string; value: string }> }> = {
    profil: {
      title: "📜 Profilul și progresul tău",
      description: "Aici vezi cine ești în Regatul Cenușii și cum crești.",
      fields: [
        {
          name: "Comenzile de bază",
          value:
            "**/profil** — nivel, XP, Oboli, chei, clasă, companion și efecte.\n" +
            "**/clasament** — top server, top global și topul serverelor.\n" +
            "**/clasa** — alegi o clasă RPG; resetarea se face din **/magazin**.\n" +
            "**/companion** — vezi companionul și evoluția lui.",
        },
        {
          name: "Clase și companioni",
          value:
            "Clasele schimbă stilul de luptă: Cavaler, Umbrolog, Străjer, Alchimist și Rătăcitor.\n" +
            "Companionii Lup, Corb, Spirit și Golem oferă bonusuri și pot evolua la nivelul 5.",
        },
        {
          name: "Cum progresezi",
          value:
            "Luptă pentru XP și Oboli, cumpără îmbunătățiri din **/magazin**, completează **/misiuni** și participă la boss-ul final.",
        },
      ],
    },
    lupta: {
      title: "⚔️ Cum funcționează lupta",
      description: "Luptele apar ca evenimente automate în canalul configurat al serverului.",
      fields: [
        {
          name: "Ora Umbrelor",
          value:
            "Când apare evenimentul, apasă butonul de atac pentru a lovi monstrul. Fiecare lovitură poate aduce XP, Oboli, materiale și uneori o cheie.",
        },
        {
          name: "Puteri de clasă",
          value:
            "Fiecare clasă are două puteri active proprii, care folosesc mană. Le vezi, deblochezi și îmbunătățești din **/magazin → Puteri**.",
        },
        {
          name: "Viață și efecte",
          value:
            "Dacă ajungi la 0 HP, lupta ta se încheie. Binecuvântările și blestemele pot modifica temporar atacul, apărarea, critica, XP-ul sau Obolii.",
        },
        {
          name: "Dragonul Stins",
          value:
            "Este boss-ul final al serverului. Intră în luptă, lovește-l cât timp e activ și primește recompensele pentru participare și contribuție.",
        },
      ],
    },
    economie: {
      title: "🏺 Economia Regatului",
      description: "Toate resursele și comenzile prin care îți construiești personajul.",
      fields: [
        {
          name: "Oboli și XP",
          value:
            "Obolii cumpără upgrade-uri, companioni, abilități și talismane. XP-ul îți crește nivelul și puterea.",
        },
        {
          name: "Comenzi",
          value:
            "**/magazin** — upgrade-uri, companioni, abilități, talismane și prestigiu.\n" +
            "**/misiuni** — două misiuni zilnice cu progres și recompense.\n" +
            "**/cufarpersonal** — recompensa pentru activitatea ta zilnică.\n" +
             "**/licitatie** — vezi licitația sau licitezi rapid cu o sumă.\n" +
             "**/posteazalicitatie** — [Admin] publică licitația într-un canal pentru toți jucătorii.",
        },
        {
          name: "Relicve",
          value:
            "Cuferele pot da fragmente. Trei fragmente de același tip pot forja o relicvă, iar duplicatele se pot schimba cu **/schimbrelicve**.",
        },
      ],
    },
    cufere: {
      title: "🗝️ Cufere, chei și recompense",
      description: "Dacă te întrebi cum obții o cheie, acesta este locul potrivit.",
      fields: [
        {
          name: "Cufere normale",
          value:
            "Alege prin butoane recompensa: Oboli, XP, binecuvântare sau relicvă. Cuferele rare pot ascunde un Mimic. Pity-ul este persistent și îți crește șansa la recompense bune.",
        },
        {
          name: "Cum obții chei",
          value:
            "Cuferele de chei apar automat, iar primul click primește cheia. Chei pot cădea și din cufere normale, din lupte și din recompensa Dragonului. Vezi inventarul cu **/chei**.",
        },
        {
          name: "Forjarea cheilor",
          value:
            "În **/chei**, trei chei de același nivel se combină într-una superioară. Cheia Pângărită este exclusă din forjarea normală.",
        },
        {
          name: "Cufere blocate",
          value:
            "Necesită cheia potrivită și plătesc mult mai mulți Oboli. Cheia Pângărită poate deschide orice cufăr blocat, dar există riscul să mistuie și recompensa. Se purifică din **/purificacheie** cu 3 Fragmente de Cenușă.",
        },
      ],
    },
    evenimente: {
      title: "🔥 Evenimentele automate",
      description: "Evenimentele apar în canalele configurate de administrator.",
      fields: [
        {
          name: "Cufărul Vegherii Zilnice",
          value:
            "Activitatea ta din mesaje, kill-uri, boss-uri, misiuni și chei se adună zilnic. La pragul potrivit, revendică recompensa din **/cufarpersonal**.",
        },
        {
          name: "Chivotul Frăției",
          value:
            "Activitatea întregului server deschide un vot. Jucătorii aleg între aur, XP și relicve, iar recompensa se împarte participanților eligibili.",
        },
        {
          name: "Cufere sezoniere",
          value:
            "La fiecare rotație apar variante sezoniere, fiecare cu imagine, recompensă și nume propriu. Apasă butonul din mesaj înainte să expire.",
        },
        {
          name: "Oracolul și cufărul secret",
          value:
            "Unele mesaje pot dezvălui clue-uri ale Oracolului. Urmează indicația din mesaj pentru a deschide Cufărul Șoaptelor.",
        },
      ],
    },
    oracol: {
      title: "🔮 Oracolul Cenușii",
      description: "Oracolul este ghidul viu al Regatului, nu doar o comandă decorativă.",
      fields: [
        {
          name: "Cum îl întrebi",
          value:
            "Menționează Oracolul într-un mesaj sau răspunde la mesajul lui. Pentru un ghid complet și butoane pe categorii, folosește **/ajutor**.",
        },
        {
          name: "Întrebări despre joc",
          value:
            "Întreabă direct: „Cum obțin o cheie?”, „Ce face clasa mea?” sau „Cum funcționează cuferele?”. Oracolul îți explică și te trimite la pagina potrivită din **/ajutor**.",
        },
        {
          name: "Profeții și relația",
          value:
            "**/profetie** oferă o profeție cosmetică, fără recompense de gameplay. Conversațiile cu Oracolul îi schimbă relația și titlul pe care ți-l acordă.",
        },
      ],
    },
    comenzi: {
      title: "🛠️ Lista comenzilor",
      description: "Comenzile jucătorilor și singura comandă de configurare.",
      fields: [
        {
          name: "Jucător",
          value:
            "**/ajutor** · **/profil** · **/clasament** · **/profetie** · **/clasa** · **/companion**\n" +
            "**/magazin** · **/misiuni** · **/cufarpersonal** · **/chei**",
        },
        {
          name: "Cufere și economie",
          value:
            "**/fratie** — vezi votul Frăției\n" +
            "**/licitatie** — licitează în Târgul Negru\n" +
            "**/schimbrelicve** — schimbă duplicate\n" +
            "**/purificacheie** — purifică Cheia Pângărită",
        },
        {
          name: "Administrator",
          value:
            "**/setcanal** configurează canalele activităților.\n" +
            "**/stopjoc** / **startjoc** opresc sau repornesc activitățile automate ale jocului.\n" +
            "**/stopai** / **startai** opresc sau repornesc Oracle AI. Toate sunt disponibile doar administratorilor.",
        },
      ],
    },
  };
  const page = pages[category];
  return {
    color: THEME_COLOR,
    title: page.title,
    description: page.description,
    fields: page.fields,
    footer: { text: `Folosește butoanele pentru a schimba categoria · ${BRAND_FOOTER}` },
  };
}

function helpComponents(category: HelpCategory): ActionRowBuilder<ButtonBuilder>[] {
  const categories: HelpCategory[] = ["profil", "lupta", "economie", "cufere", "evenimente"];
  const firstRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...categories.map((key) =>
      new ButtonBuilder()
        .setCustomId(`help_page_${key}`)
        .setLabel(HELP_CATEGORY_LABELS[key])
        .setStyle(key === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
  const secondRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(["oracol", "comenzi"] as HelpCategory[]).map((key) =>
      new ButtonBuilder()
        .setCustomId(`help_page_${key}`)
        .setLabel(HELP_CATEGORY_LABELS[key])
        .setStyle(key === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    new ButtonBuilder()
      .setCustomId(`help_ask_${category}`)
      .setLabel("🔮 Întreabă Oracolul")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("help_home")
      .setLabel("⌂ Acasă")
      .setStyle(ButtonStyle.Secondary),
  );
  return [firstRow, secondRow];
}

function helpHomeEmbed() {
  return {
    color: THEME_COLOR,
    title: "❓ Ghidul interactiv al Regatului Cenușii",
    description:
      "Alege o categorie ca să vezi explicațiile. Dacă nu găsești răspunsul, apasă **Întreabă Oracolul** și scrie întrebarea ta.",
    fields: [
      {
        name: "De unde începi?",
        value: "**/profil** pentru starea ta · **/magazin** pentru upgrade-uri · **/misiuni** pentru obiectivele zilei.",
      },
      {
        name: "Întrebarea cea mai căutată",
        value: "Pentru chei: intră la **Cufere**, apoi apasă **Întreabă Oracolul** și scrie „Cum obțin o cheie?”.",
      },
      {
        name: "Oracolul te ghidează",
        value: "Îl poți menționa în chat sau poți folosi întrebarea din această fereastră. Pentru orice mecanică, revino la **/ajutor**.",
      },
    ],
    footer: { text: BRAND_FOOTER },
  };
}

async function handleAjutor(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    embeds: [helpHomeEmbed()],
    components: helpComponents("profil"),
    flags: MessageFlags.Ephemeral,
  });
}

function helpQuestionAnswer(question: string, category: HelpCategory): string {
  const normalized = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(cheie|chei|cufar|cufere|pangarita|fragment|relicv)/.test(normalized)) {
    return (
      "Cheile se obțin din cuferele de chei, din unele cufere normale, din lupte și din recompensa Dragonului. " +
      "Trei chei de același nivel se forjează în **/chei**; Cheia Pângărită se purifică din **/purificacheie**. " +
      "Pentru harta completă a cuferelelor, apasă categoria **Cufere** sau deschide **/ajutor**."
    );
  }
  if (/\b(clasa|clase|companion|lup|corb|spirit|golem|magazin|upgrade|abilitat|talisman)/.test(normalized)) {
    return (
      "Clasele, companionii, abilitățile și talismanele se aleg sau se îmbunătățesc din **/magazin**. " +
      "Clasa curentă o vezi în **/profil**, iar regulile pe scurt sunt în **/ajutor → Profil** și **/ajutor → Economie**."
    );
  }
  if (/\b(lupt|atac|boss|dragon|hp|mana|viata|xp|obol)/.test(normalized)) {
    return (
      "Luptă când apare Ora Umbrelor, folosește butoanele de atac și abilitățile cu mană, apoi participă la Dragonul Stins pentru recompense de server. " +
      "Detaliile sunt în **/ajutor → Luptă**; ghidul complet rămâne disponibil prin **/ajutor**."
    );
  }
  if (/\b(misiun|fratie|licitat|oracol|profet|mesaj|activitat)/.test(normalized)) {
    return (
      "Pentru această mecanică, deschide categoria potrivită din **/ajutor**. " +
      "Misiunile și activitatea se verifică din **/misiuni** și **/cufarpersonal**, iar Oracolul poate explica fiecare pas dacă îl menționezi."
    );
  }
  return (
    `Cenușa îmi arată că întrebarea ta ține de categoria **${HELP_CATEGORY_LABELS[category]}**. ` +
    "Deschide **/ajutor**, alege categoria și vei găsi pașii; dacă încă nu este limpede, întreabă-mă din nou cu mai multe detalii."
  );
}

async function handleHelpButton(interaction: ButtonInteraction) {
  const id = interaction.customId;
  if (id === "help_home") {
    await interaction.deferUpdate();
    await interaction.editReply({ embeds: [helpHomeEmbed()], components: helpComponents("profil") });
    return;
  }
  if (id.startsWith("help_ask_")) {
    const category = id.replace("help_ask_", "") as HelpCategory;
    const modal = new ModalBuilder()
      .setCustomId(`help_question_${category}`)
      .setTitle("Întreabă Oracolul");
    const input = new TextInputBuilder()
      .setCustomId("help_question_text")
      .setLabel("Ce vrei să afli despre joc?")
      .setPlaceholder("Ex.: Cum obțin o cheie?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(500);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (id.startsWith("help_page_")) {
    const category = id.replace("help_page_", "") as HelpCategory;
    if (!(category in HELP_CATEGORY_LABELS)) return;
    await interaction.deferUpdate();
    await interaction.editReply({
      embeds: [buildHelpEmbed(category)],
      components: helpComponents(category),
    });
  }
}

async function handleHelpQuestion(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const category = interaction.customId.replace("help_question_", "") as HelpCategory;
    const safeCategory = category in HELP_CATEGORY_LABELS ? category : "oracol";
    const question = interaction.fields.getTextInputValue("help_question_text").trim();
    const oracleAnswer = isOracleEnabled(interaction.guildId!)
      ? await answerHelpQuestion(question, interaction.user.id, interaction.guildId!)
      : null;
    const answer = oracleAnswer ?? helpQuestionAnswer(question, safeCategory);

    await interaction.editReply({
      embeds: [
        {
          color: THEME_COLOR,
          title: oracleAnswer ? "🔮 Oracolul îți răspunde" : "🔮 Răspunsul ghidului Cenușii",
          description: answer,
          footer: { text: `Întrebare: ${question.slice(0, 120)} · ${BRAND_FOOTER}` },
        },
      ],
      components: helpComponents(safeCategory),
    });
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId }, "Help Oracle modal failed");
    await interaction.editReply({
      content: "🔮 Oracolul a întâmpinat o ceață neașteptată. Încearcă din nou sau alege o categorie din ghid.",
      embeds: [],
      components: [],
    }).catch(() => null);
  }
}

const gameHelpNudgeAt = new Map<string, number>();

function isGameHelpQuestionText(text: string): boolean {
  if (!text.includes("?")) return false;
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /\b(cheie|chei|cufar|cufere|lupt|boss|dragon|misiun|magazin|clasa|companion|relicv|fragment|obol|xp|mana|oracol|profet|licitat|fratie|cavaler|umbrolog|strajer|alchimist|ratacitor)\b/.test(normalized);
}

function maybeNudgeGameHelp(message: Message): void {
  if (!message.guildId || !isGameHelpQuestionText(message.content ?? "")) return;
  if (message.reference?.messageId || message.mentions.users.has(botClient?.user?.id ?? "")) return;
  const now = Date.now();
  const previous = gameHelpNudgeAt.get(message.guildId) ?? 0;
  if (now - previous < 30_000) return;
  gameHelpNudgeAt.set(message.guildId, now);
  void message.author.send({
    content:
      "🔮 Oracolul te îndrumă: întrebarea ta ține de mecanicile Regatului. " +
      "Deschide **/ajutor** în server pentru ghidul interactiv, alege categoria potrivită " +
      "și poți întreba Oracolul direct de acolo.",
  }).catch((err) => logger.debug({ err, guildId: message.guildId }, "Could not DM game help nudge"));
}

async function handleMisiune(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;
  const today = todayDateUTC();
  const gameplayConfig = getGameplayConfig(guildId);
  const rows = await getDailyQuestRows(discordId, guildId);
  const byKey: Partial<Record<DailyQuestKey, DailyQuestRowLike>> = {};
  for (const r of rows) {
    if (r.questKey in DAILY_QUESTS) {
      byKey[r.questKey as DailyQuestKey] = {
        progress: r.progress,
        completed: r.completed,
        rewardGiven: r.rewardGiven,
        questDate: r.questDate,
      };
    }
  }
  await interaction.editReply({ embeds: [buildMissionEmbed(byKey, today, gameplayConfig)] });
}

const PERSONAL_CHEST_REFRESH_MS = 10_000;

type PersonalChestRefresh = {
  message: Message;
  userId: string;
  guildId: string;
  username: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

const personalChestRefreshes = new Map<string, PersonalChestRefresh>();

function personalChestRefreshKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function stopPersonalChestRefresh(key: string): void {
  const active = personalChestRefreshes.get(key);
  if (!active) return;
  clearTimeout(active.timer);
  personalChestRefreshes.delete(key);
}

function nextUtcMidnight(): number {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}

function schedulePersonalChestRefresh(
  message: Message,
  userId: string,
  guildId: string,
  username: string,
): void {
  const key = personalChestRefreshKey(guildId, userId);
  stopPersonalChestRefresh(key);

  let state!: PersonalChestRefresh;
  const refresh = async (): Promise<void> => {
    if (personalChestRefreshes.get(key) !== state) return;
    if (Date.now() >= state.expiresAt) {
      stopPersonalChestRefresh(key);
      return;
    }

    const activity = await getPersonalActivity(userId, guildId).catch((err) => {
      logger.debug({ err, guildId, userId }, "Personal chest refresh failed");
      return null;
    });
    if (!activity || personalChestRefreshes.get(key) !== state) return;

    await message.edit({
      content: `🕯️ **Cufărul personal al lui ${username}** — progresul se actualizează automat.`,
      embeds: [buildPersonalChestEmbed(activity, username)],
      components: [personalChestRow(activity, userId)],
    }).catch(() => {
      stopPersonalChestRefresh(key);
    });

    if (personalChestRefreshes.get(key) === state && !activity.claimed) {
      state.timer = setTimeout(() => void refresh(), PERSONAL_CHEST_REFRESH_MS);
    } else {
      stopPersonalChestRefresh(key);
    }
  };

  state = {
    message,
    userId,
    guildId,
    username,
    expiresAt: nextUtcMidnight(),
    timer: setTimeout(() => void refresh(), PERSONAL_CHEST_REFRESH_MS),
  };
  personalChestRefreshes.set(key, state);
}

async function handlePersonalChest(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const activity = await getPersonalActivity(interaction.user.id, guildId);
  await interaction.editReply({
    content: `🕯️ **Cufărul personal al lui ${interaction.user.username}** — doar această persoană îl poate deschide.`,
    embeds: [buildPersonalChestEmbed(activity, interaction.user.username)],
    components: [personalChestRow(activity, interaction.user.id)],
    allowedMentions: { parse: [] },
  });
  const message = await interaction.fetchReply();
  schedulePersonalChestRefresh(message, interaction.user.id, guildId, interaction.user.username);
}

async function handleFratia(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const vote = await loadFratiaVote(interaction.guildId!);
  if (!vote || (vote.status === "open" && vote.closesAt <= Date.now())) {
    await interaction.editReply({
      content: "🤝 Chivotul este liniștit pentru moment. Votul se deschide după următorul prag de activitate al Regatului.",
    });
    return;
  }
  await interaction.editReply({
    embeds: [buildFratiaVoteEmbed(vote)],
    components: vote.status === "open" ? fratiaVoteRows() : [],
  });
}

async function handleLicitatie(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const amount = interaction.options.getInteger("suma");
  if (amount != null) {
    const result = await placeAuctionBid(guildId, interaction.user.id, amount);
    await refreshPublicAuctionMessage(interaction.client, result.auction);
    await interaction.editReply({
      content: result.message,
      embeds: [buildAuctionEmbed(result.auction)],
      components: [auctionRow()],
    });
    return;
  }
  const auction = await getAuction(guildId);
  await interaction.editReply({ embeds: [buildAuctionEmbed(auction)], components: [auctionRow()] });
}

async function refreshPublicAuctionMessage(client: Client, auction: Awaited<ReturnType<typeof getAuction>>): Promise<boolean> {
  if (!auction.channelId || !auction.messageId) return false;
  const channel = await client.channels.fetch(auction.channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return false;
  const message = await channel.messages.fetch(auction.messageId).catch(() => null);
  if (!message) return false;
  return message.edit({
    embeds: [buildAuctionEmbed(auction)],
    components: [auctionRow()],
  }).then(() => true).catch(() => false);
}

async function handlePosteazaLicitatie(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel("canal", true);
  if (!(channel instanceof TextChannel)) {
    await interaction.editReply({
      content: "❌ Alege un canal text obișnuit, nu un canal vocal sau un thread.",
    });
    return;
  }

  try {
    const guildId = interaction.guildId!;
    const auction = await getAuction(guildId);
    if (auction.channelId && auction.messageId) {
      const oldChannel = await interaction.client.channels.fetch(auction.channelId).catch(() => null);
      if (oldChannel instanceof TextChannel) {
        const oldMessage = await oldChannel.messages.fetch(auction.messageId).catch(() => null);
        if (oldMessage) {
          if (oldChannel.id === channel.id) {
            await oldMessage.edit({
              embeds: [buildAuctionEmbed(auction)],
              components: [auctionRow()],
            });
            await interaction.editReply({
              content: `✅ Licitația a fost reîmprospătată în <#${channel.id}>.`,
            });
            return;
          }
          await oldMessage.delete().catch(() => null);
        }
      }
    }

    const message = await channel.send({
      embeds: [buildAuctionEmbed(auction)],
      components: [auctionRow()],
      allowedMentions: { parse: [] },
    });
    const attached = await attachAuctionMessage(guildId, channel.id, message.id);
    await message.edit({
      embeds: [buildAuctionEmbed(attached)],
      components: [auctionRow()],
    });
    await interaction.editReply({
      content: `✅ Licitația este publicată în <#${channel.id}>. Jucătorii pot apăsa **Licitează** și introduce oferta.`,
    });
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId }, "Failed to publish auction");
    await interaction.editReply({
      content: "❌ Nu am putut publica licitația. Verifică permisiunea botului de a vedea și trimite mesaje în canal.",
    });
  }
}

async function handleSchimbRelicve(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const duplicate = await exchangeDuplicateRelic(interaction.user.id, interaction.guildId!);
  await interaction.editReply({
    content: duplicate
      ? `💎 Ai schimbat două fragmente **${ITEMS[duplicate as keyof typeof ITEMS]?.label ?? duplicate}** într-un **Fragment de Ochi al Cenușii**.`
      : "🕯️ Nu ai două fragmente identice disponibile pentru schimb.",
  });
}

async function handlePurificaCheie(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const purified = await purifyCorruptedKey(interaction.user.id, interaction.guildId!);
  await interaction.editReply({
    content: purified
      ? "🧪 **Cheia Pângărită a fost purificată!** Ai primit o Cheie a Umbrei Frânte."
      : "❌ Purificarea a eșuat. Ai nevoie de **3× Fragment de Cenușă**.",
    embeds: purified ? [] : [corruptedKeyEmbed()],
  });
}

async function handleChei(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const requested = interaction.options.getString("combina");
  const player = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);

  const forgeable = new Set(["rar", "epic", "regal", "oase", "fum"]);
  if (requested && forgeable.has(requested)) {
    const forged = await combinePlayerKeys(
      interaction.user.id,
      guildId,
      requested as Exclude<KeyType, "cavaler" | "pangarita">,
    );
    if (!forged) {
      const needed = `3 ${KEY_LABEL[requested]}`;
      await interaction.editReply({ content: `🔒 Nicovala refuză metalul: ai nevoie de **${needed}** pentru forjare.` });
      return;
    }
  }

  const keys = await getPlayerKeys(interaction.user.id, guildId);
  const rar = keys?.rar ?? player.keyRar;
  const epic = keys?.epic ?? player.keyEpic;
  const regal = keys?.regal ?? player.keyRegal;
  const oase = keys?.oase ?? player.keyOase;
  const fum = keys?.fum ?? player.keyFum;
  const cavaler = keys?.cavaler ?? player.keyCavaler;
  const pangarita = keys?.pangarita ?? player.keyPangarita;
  const forgedLine = requested
    ? `\n⚒️ 3 ${KEY_LABEL[requested]} au devenit 1 ${KEY_LABEL[requested === "rar" ? "epic" : requested === "epic" ? "regal" : requested === "regal" ? "oase" : requested === "oase" ? "fum" : "cavaler"]}.`
    : "";
  await interaction.editReply({
    content:
      `🗝️ **Forja Cheilor**\n` +
      `${KEY_EMOJI.rar} **${rar}** ${KEY_LABEL.rar} · ${KEY_EMOJI.epic} **${epic}** ${KEY_LABEL.epic} · ${KEY_EMOJI.regal} **${regal}** ${KEY_LABEL.regal}\n` +
      `${KEY_EMOJI.oase} **${oase}** ${KEY_LABEL.oase} · ${KEY_EMOJI.fum} **${fum}** ${KEY_LABEL.fum} · ${KEY_EMOJI.cavaler} **${cavaler}** ${KEY_LABEL.cavaler}\n` +
      `☠️ **${pangarita}** ${KEY_LABEL.pangarita}\n` +
      `*Cheile superioare deschid cufere mai rare, până la comoara Cavalerului Cenușiu. Cheia Pângărită nu intră în forjarea obișnuită.*${forgedLine}`,
  });
}

async function handleMagazin(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function isOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  // Ownerul serverului sau oricine cu permisiunea de Administrator pe server
  // poate folosi comenzile admin; creatorul botului are acces implicit.
  const isGuildAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (isGuildAdmin || interaction.user.id === SUPER_ADMIN_ID) return true;
  await interaction.reply({
    content: "🔒 **Ai nevoie de permisiunea de Administrator pe acest server ca să folosești această comandă.**",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function reconfigureTraderChannel(guildId: string, channel: TextChannel): Promise<void> {
  const client = botClient;
  const previousChannelId = getChannel("trader", guildId);
  const previousMessageId = getTraderMessageId(guildId) ?? await loadTraderMessageId(guildId);

  await setChannel(guildId, "trader", channel.id);

  if (previousChannelId !== channel.id) {
    setTraderMessageId(guildId, null);
    await clearTraderMessageId(guildId).catch(() => null);

    if (client && previousChannelId && previousMessageId) {
      const previousChannel = await client.channels.fetch(previousChannelId).catch(() => null);
      if (previousChannel instanceof TextChannel) {
        const previousMessage = await previousChannel.messages.fetch(previousMessageId).catch(() => null);
        await previousMessage?.delete().catch(() => null);
      }
    }
  }

  if (!client) throw new Error("Discord bot client is not available");
  await setupTrader(client, guildId);
}

async function handleSetCanal(interaction: ChatInputCommandInteraction) {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel("canal", true);
  if (!(channel instanceof TextChannel)) {
    await interaction.editReply({
      content: "❌ Alege un canal text obișnuit, nu un canal vocal sau un thread.",
    });
    return;
  }

  const type = interaction.options.getString("tip", true);

  try {
    if (type === "tribut") {
      const config = await saveTributeConfig(interaction.guildId!, channel.id);
      if (botClient) {
        await restartTributeScheduler(botClient, interaction.guildId!);
        await fireTribute(botClient, interaction.guildId!);
      }
      await interaction.editReply({
        content:
          `✅ **Tributul Regatului** va fi publicat în <#${channel.id}>.\n` +
          `Evenimentul rămâne deschis **24 de ore**, apoi urmează **24 de ore pauză**.`,
      });
      logger.info(
        { channelId: channel.id, intervalMinutes: config.intervalMinutes, userId: interaction.user.id, guildId: interaction.guildId },
        "Tribute channel configured via /setcanal",
      );
      return;
    }

    const eventKey = type as EventType;
    if (!(eventKey in EVENT_LABELS)) {
      await interaction.editReply({ content: "❌ Tipul de activitate ales nu este valid." });
      return;
    }
    if (eventKey === "trader") {
      await reconfigureTraderChannel(interaction.guildId!, channel);
    } else {
      await setChannel(interaction.guildId!, eventKey, channel.id);
      if ((eventKey === "council" || eventKey === "main") && botClient) {
        stopOracleCouncilScheduler(interaction.guildId!);
        const councilChannelId = getChannel("council", interaction.guildId!) ?? channel.id;
        startOracleCouncilScheduler(botClient, interaction.guildId!, councilChannelId);
      }
    }
    await interaction.editReply({
      content: `✅ **${EVENT_LABELS[eventKey]}** va fi publicat în <#${channel.id}>.`,
    });
    logger.info(
      { eventKey, channelId: channel.id, userId: interaction.user.id, guildId: interaction.guildId },
      "Channel configured via /setcanal",
    );
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId, type }, "Failed to configure channel via /setcanal");
    await interaction.editReply({
      content: "❌ Nu am putut salva canalul. Verifică permisiunile botului și încearcă din nou.",
    });
  }
}

async function announceGameState(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  const configuredChannelId = getChannel("main", interaction.guildId!);
  const channel = configuredChannelId
    ? await interaction.client.channels.fetch(configuredChannelId).catch(() => null)
    : interaction.channel;

  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logger.warn({ guildId: interaction.guildId }, "Could not publish game state announcement: no public main channel");
    return;
  }

  await channel.send({
    content,
    allowedMentions: { parse: [] },
  }).catch((err) => {
    logger.warn({ err, guildId: interaction.guildId }, "Failed to publish game state announcement");
  });
}

async function handleStopGame(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await setGameplayPaused(interaction.guildId!, true);
  stopGuildScheduler(interaction.guildId!);
  await announceGameState(
    interaction,
    "⏸️ **Jocul a fost oprit.** Activitățile automate ale Regatului sunt suspendate până la repornire.",
  );
  await interaction.editReply({
    content:
      "⏸️ **Jocul a fost oprit pe acest server.**\n" +
      "Nu se mai pornesc evenimente, cufere, boss-i, tributuri sau alte activități automate. " +
      "Folosește `/startjoc` pentru repornire.",
  });
}

async function handleStartGame(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!botClient) {
    await interaction.editReply({ content: "❌ Botul Discord nu este disponibil momentan." });
    return;
  }
  await setGameplayPaused(interaction.guildId!, false);
  startGuildScheduler(botClient, interaction.guildId!);
  await announceGameState(
    interaction,
    "▶️ **Jocul a fost repornit.** Activitățile automate ale Regatului sunt din nou active.",
  );
  await interaction.editReply({
    content: "▶️ **Jocul a fost repornit pe acest server.** Activitățile automate vor continua.",
  });
}

async function handleStopAI(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  stopOracle(interaction.guildId!);
  stopOracleCouncilScheduler(interaction.guildId!);
  await interaction.editReply({
    content: "🛑 **Oracle AI a fost oprit pe acest server.** Nu va mai răspunde și nu va mai posta activități automate.",
  });
}

async function handleStartAI(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await isOwner(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const mainChannelId = getChannel("main", interaction.guildId!);
  const councilChannelId = getChannel("council", interaction.guildId!) ?? mainChannelId;
  if (!mainChannelId || !councilChannelId || !botClient) {
    await interaction.editReply({
      content: "❌ Nu există un canal principal configurat sau botul nu este disponibil.",
    });
    return;
  }
  resumeOracle(interaction.guildId!);
  startOracle(botClient, mainChannelId, interaction.guildId!);
  startOracleCouncilScheduler(botClient, interaction.guildId!, councilChannelId);
  await interaction.editReply({
    content: "✨ **Oracle AI a fost repornit pe acest server.**",
  });
}

async function handleSetAliantaText(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "🔒 Doar membrii cu permisiunea de Administrator pot modifica textul alianței.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const currentText =
      (await loadAllianceRecruitmentText(interaction.guildId!)) ??
      DEFAULT_ALLIANCE_RECRUITMENT_TEXT;
    await interaction.showModal(allianceRecruitmentTextModal(currentText));
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId }, "Could not load alliance recruitment text");
    await interaction.reply({
      content: "❌ Textul alianței nu a putut fi încărcat. Încearcă din nou.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleSetAliantaTextModal(interaction: ModalSubmitInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "🔒 Doar membrii cu permisiunea de Administrator pot modifica textul alianței.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const text = interaction.fields.getTextInputValue("alliance_recruitment_text").trim();
  if (!text) {
    await interaction.reply({
      content: "❌ Textul alianței nu poate fi gol.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await saveAllianceRecruitmentText(interaction.guildId!, text.slice(0, 4000));
    await interaction.editReply({
      content:
        "✅ Textul alianței a fost salvat. Va fi folosit la următoarea confirmare a unei alianțe.",
    });
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId }, "Could not save alliance recruitment text");
    await interaction.editReply({
      content: "❌ Textul alianței nu a putut fi salvat. Încearcă din nou.",
    });
  }
}

async function handleClasament(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand(false);

  // ── /clasament servere ──────────────────────────────────────────────────────
  if (sub === "servere") {
    const ranking = await getServerRanking();
    const medals = ["🥇", "🥈", "🥉"];
    const lines = ranking.map((row: ServerRankRow, i) => {
      const name = interaction.client.guilds.cache.get(row.guildId)?.name ?? `Regat necunoscut`;
      const playerWord = row.playerCount === 1 ? "luptător" : "luptători";
      return `${medals[i] ?? `**${i + 1}.**`} **${name}** — ⭐ ${row.totalReputation.toLocaleString("ro-RO")} Reputație · 🏅 Niv. ${row.maxEventLevel} · 👥 ${row.playerCount} ${playerWord}`;
    }).join("\n");

    await interaction.editReply({
      embeds: [
        {
          color: THEME_COLOR,
          title: "🏆 Clasamentul Regatelor Cenușii",
          description: lines || "*Niciun regat nu și-a scris încă legenda.*",
          footer: { text: "Clasament calculat după reputația totală acumulată de toți luptătorii" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
    return;
  }

  // ── /clasament server | /clasament global ──────────────────────────────────
  const isGlobal = sub === "global";
  const top = isGlobal ? await getGlobalTopPlayers() : await getTopPlayers(guildId);
  const medals = ["🥇", "🥈", "🥉"];
  const champAvatar = top[0] ? await avatarById(top[0].discordId) : null;

  const lines = top.map((p, i) => {
    const deathStr = p.deaths > 0 ? ` | 💀 ${p.deaths}×` : "";
    const serverTag = isGlobal ? ` *(${interaction.client.guilds.cache.get(p.guildId)?.name ?? "Regat necunoscut"})* ` : "";
    const repStr = p.reputation > 0 ? `⭐ ${p.reputation.toLocaleString("ro-RO")} Rep.` : "⭐ 0 Rep.";
    const levelStr = p.maxLevel > 0 ? ` · 🏅 Niv. ${p.maxLevel}` : "";
    const prestigeStr = p.prestigeLevel > 0 ? ` · 💎 Prestigiu ${p.prestigeLevel}` : "";
    return `${medals[i] ?? `**${i + 1}.**`} **${p.username}**${serverTag} — ${repStr}${levelStr}${prestigeStr}${deathStr}`;
  }).join("\n");

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  if (top.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("leaderboard_profile_select")
      .setPlaceholder("📜 Vezi profilul unui luptător…")
      .addOptions(
        top.map((p, i) => ({
          label: `${medals[i] ?? `#${i + 1}`} ${p.username}`.slice(0, 100),
          description: `⭐ ${p.reputation.toLocaleString("ro-RO")} Rep. · 🏅 Niv. ${p.maxLevel}${p.prestigeLevel > 0 ? ` · 💎 Prestigiu ${p.prestigeLevel}` : ""}`.slice(0, 100),
          value: p.discordId,
        })),
      );
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  const title = isGlobal
    ? "🌍 Clasament Global — Toate Regatele Cenușii"
    : "👑 Clasament — Regatul Cenușii";

  await interaction.editReply({
    embeds: [
      {
        color: THEME_COLOR,
        title,
        description: lines || "*Nimeni nu a luptat încă.*",
        ...(champAvatar ? { thumbnail: { url: champAvatar } } : {}),
        footer: { text: top.length > 0 ? "Clasament după Reputație și Nivel Eveniment · Alege un luptător pentru profil complet" : BRAND_FOOTER },
        timestamp: new Date().toISOString(),
      },
    ],
    components,
  });
}

async function handleViewProfile(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  discordId: string,
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const player = await getPlayerById(discordId, guildId);
  if (!player) {
    await interaction.editReply({ content: "❌ Jucătorul nu a fost găsit." });
    return;
  }
  await interaction.editReply({
    embeds: [buildProfileEmbed(player, undefined, await avatarById(discordId))],
  });
}

async function handleClasamentSelect(interaction: StringSelectMenuInteraction) {
  const discordId = interaction.values[0];
  await handleViewProfile(interaction, discordId);
}

// Public reward follow-ups are temporary channel notices. Keep them visible
// long enough to read, but remove them before they create the same clutter as
// the original chest messages.
const CLAIM_TTL_MS = 2 * 60 * 1000;
const BOSS_RESULT_TTL_MS = 10 * 60 * 1000;

async function deleteClaimedChestMessage(
  message: Pick<Message, "id" | "delete">,
  chestId: string,
  phase: string,
): Promise<void> {
  try {
    await message.delete();
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";
    if (code !== "10008") {
      logger.warn({ err, messageId: message.id, chestId, phase }, "Failed to delete claimed chest message");
    }
  }
}

const CHEST_CLAIM_MSG: Record<string, (user: string, gold: number) => string> = {
  bronz:  (u, g) => `🪙 **${u}** a deschis **Cufărul de Bronz** și a câștigat **${g} Oboli**!`,
  argint: (u, g) => `✨🥈 **${u}** a deschis **Cufărul de Argint** și a câștigat **${g} Oboli**! Argintul strălucește!`,
  aur:    (u, g) => `🌟🥇 **${u}** a deschis **Cufărul de Aur**! **${g} Oboli** aurii se revarsă! 💰💰`,
  mitic:  (u, g) => `💎⚡ **${u}** a deschis un **CUFĂR MITIC**!! **${g} Oboli** răsar din adâncurile timpului! ⚡💎`,
};

const CHEST_RELIC_FRAGMENT: Record<string, string> = {
  bronz: "fragment_luna_stinsa",
  argint: "fragment_ochiul_cenușii",
  aur: "fragment_inima_abisului",
  mitic: "fragment_coroana",
  regal: "fragment_coroana",
};
const CHEST_RELIC: Record<string, string> = {
  fragment_luna_stinsa: "relic_luna",
  fragment_ochiul_cenușii: "relic_ochiul",
  fragment_inima_abisului: "relic_inima",
  fragment_coroana: "relic_coroana",
};
const MIMIC_RARITIES = new Set(["aur", "mitic", "regal"]);
const resolvedMimics = new Set<string>();

async function awardChestRelic(discordId: string, guildId: string, rarityKey: string, guaranteed = false): Promise<string> {
  const fragmentKey = CHEST_RELIC_FRAGMENT[rarityKey] ?? CHEST_RELIC_FRAGMENT.bronz!;
  const quantity = guaranteed || Math.random() < (rarityKey === "mitic" || rarityKey === "regal" ? 1 : 0.55) ? 2 : 1;
  await addPlayerItem(discordId, guildId, fragmentKey, quantity);

  let forged = "";
  const current = Object.fromEntries((await getPlayerItems(discordId, guildId)).map((item) => [item.itemKey, item.quantity]));
  while ((current[fragmentKey] ?? 0) >= 3) {
    const consumed = await consumePlayerItems(discordId, guildId, { [fragmentKey]: 3 });
    if (!consumed) break;
    await addPlayerItem(discordId, guildId, CHEST_RELIC[fragmentKey]!, 1);
    current[fragmentKey] = (current[fragmentKey] ?? 0) - 3;
    forged = CHEST_RELIC[fragmentKey]!;
  }
  return forged ? `${quantity}× ${ITEMS[fragmentKey as keyof typeof ITEMS].label} și **${ITEMS[forged as keyof typeof ITEMS].label}**` : `${quantity}× ${ITEMS[fragmentKey as keyof typeof ITEMS].label}`;
}

async function handleMimicClaim(
  interaction: ButtonInteraction,
  chestId: string,
  ownerId: string,
  rarityKey: string,
  gold: number,
) {
  await interaction.deferUpdate();
  if (interaction.user.id !== ownerId) {
    await interaction.followUp({ content: "👁️ Mimicul te recunoaște doar pe cel care a atins sigiliul.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (resolvedMimics.has(chestId)) {
    await ephemeralNote(interaction, "chest", "💀 Mimicul a fost deja înfruntat.");
    return;
  }
  resolvedMimics.add(chestId);
  const victory = Math.random() < (rarityKey === "regal" ? 0.58 : 0.7);
  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_mimic_done`)
      .setLabel(victory ? "Mimic învins" : "Mimic eliberat")
      .setEmoji(victory ? "⚔️" : "💀")
      .setStyle(victory ? ButtonStyle.Success : ButtonStyle.Danger)
      .setDisabled(true),
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
  if (victory) {
    const rmods = getRewardMultipliers(interaction.user.id, interaction.guildId!);
    const payout = Math.round(gold * 2.5 * rmods.goldMult);
    await addPlayerGold(interaction.user.id, interaction.guildId!, payout);
    const relicLine = await awardChestRelic(interaction.user.id, interaction.guildId!, rarityKey, true);
    const reply = await interaction.followUp({
      content: `⚔️ **Mimicul a fost învins!** Cufărul își varsă adevărata comoară: **${payout} Oboli** și ${relicLine}.`,
    });
    setTimeout(() => { void reply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  } else {
    const curse = grantRandomCurse(interaction.user.id);
    const reply = await interaction.followUp({
      content: `💀 **Mimicul s-a trezit!** Te-a mușcat și a fugit în cenușă. Primești blestemul: ${curse.label}.`,
    });
    setTimeout(() => { void reply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  }
  await deleteClaimedChestMessage(interaction.message, chestId, "mimic-resolved");
}

async function handleChestClaim(
  interaction: ButtonInteraction,
  chestId: string,
  rarityKey: string,
  gold: number,
  multOverride: number = 1,
  choice = "gold",
  variant = "aur",
) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  if (claimedChests.has(chestId)) {
    await ephemeralNote(interaction, "chest", "😔 Cineva a fost mai rapid! Cufărul a fost deja revendicat.");
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId).catch(() => null);

  const validChoices = new Set(["gold", "xp", "blessing", "relic"]);
  if (!validChoices.has(choice)) choice = "gold";
  const isPremium = rarityKey !== "bronz";
  const player = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const pity = await advanceChestPity(interaction.user.id, guildId, isPremium);
  const isMimic = choice === "gold" && (variant === "blestemat" || MIMIC_RARITIES.has(rarityKey)) && Math.random() < (rarityKey === "regal" ? 0.18 : 0.12);
  const effectiveMult = choice === "gold" ? (multOverride > 1 ? multOverride : rollChestMultiplier()) : 1;
  const effects = getRewardMultipliers(interaction.user.id, guildId);
  const classGoldMult = player.class === "alchimist" ? 1.2 : 1;
  const classXpMult = player.class === "strajer" ? 1.1 : 1;
  const rmods = { goldMult: effects.goldMult * classGoldMult, xpMult: effects.xpMult * classXpMult };
  const totalGold = Math.round(gold * effectiveMult * rmods.goldMult);

  let xpReward = 0;
  if (!isMimic && choice === "gold") await addPlayerGold(interaction.user.id, guildId, totalGold);
  if (!isMimic && choice === "xp") {
    xpReward = Math.max(10, Math.round(gold * 0.85 * rmods.xpMult));
    await addPlayerXp(interaction.user.id, guildId, xpReward);
  }

  const openingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_opening`)
      .setLabel("Se deschide…")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Revendicat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );

  await interaction.editReply({ components: [openingRow] });
  await new Promise<void>((r) => setTimeout(r, 900));
  if (isMimic) {
    const mimicRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mimic_${chestId}_${interaction.user.id}_${rarityKey}_${gold}`)
        .setLabel("Înfruntă Mimicul")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Danger),
    );
    await interaction.message.edit({ components: [mimicRow] }).catch(() => null);
  } else {
    await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
  }

  const claimContent = isMimic
    ? `👁️ **${interaction.user.username}** a deschis sigiliul… dar **cufărul era un MIMIC**! Alege dacă îl înfrunți — comoara adevărată încă pulsează în el.`
    : choice === "xp"
      ? `✨ **${interaction.user.username}** a ales calea experienței și a primit **${xpReward} XP**!`
      : choice === "blessing"
        ? `🕯️ **${interaction.user.username}** a ales binecuvântarea ascunsă în cufăr.`
        : choice === "relic"
          ? `💎 **${interaction.user.username}** a ales calea relicvelor. Fragmentele vechi se trezesc…`
          : (CHEST_CLAIM_MSG[rarityKey] ?? CHEST_CLAIM_MSG["bronz"]!)(interaction.user.username, totalGold);
  const claimReply = await interaction.followUp({ content: claimContent });
  setTimeout(() => { void claimReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const revealContent = effectiveMult > 1
    ? `🎲 **Norocul Cenușii!** A picat **×${effectiveMult}**! Obolii s-au înmulțit (${gold} × ${effectiveMult} = **${totalGold} Oboli**)! ${effectiveMult === 3 ? "🔥🔥🔥" : "✨"}`
    : `🎲 **Norocul Cenușii:** a picat **×1** de data asta — fără bonus. Ai primit **${gold} Oboli**.`;
  const bonusReply = await interaction.followUp({ content: isMimic ? "🩸 *Dinăuntru se aude un mârâit…*" : revealContent });
  setTimeout(() => { void bonusReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const keyDrop = KEY_DROP[rarityKey];
  if (keyDrop && Math.random() < keyDrop.chance) {
    const keyType = keyDrop.keyType as KeyType;
    await addPlayerKey(interaction.user.id, guildId, keyType);
    void recordPersonalActivity(interaction.user.id, guildId, "keys").catch((err) =>
      logger.warn({ err, discordId: interaction.user.id, guildId }, "Personal key activity update failed"),
    );
    const keyDropReply = await interaction.followUp({ content: buildKeyDropMessage(rarityKey, keyType) });
    setTimeout(() => { void keyDropReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, keyType }, "Key dropped");
  }

  if (!isMimic && (choice === "blessing" || pity.triggered)) {
    const effectDef = grantRandomBlessing(interaction.user.id);
    const effectReply = await interaction.followUp({ content: buildChestEffectMessage(interaction.user.username, effectDef) });
    setTimeout(() => { void effectReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  }

  if (!isMimic && (choice === "relic" || pity.triggered || (rarityKey !== "bronz" && Math.random() < 0.22))) {
    const relicLine = await awardChestRelic(interaction.user.id, guildId, rarityKey, pity.triggered || choice === "relic");
    const relicReply = await interaction.followUp({ content: `💎 **Colecția relicvelor:** ai găsit ${relicLine}. ${pity.triggered ? "Norocul tău a plătit tributul!" : "Mai găsește trei fragmente pentru a forja relicva."}` });
    setTimeout(() => { void relicReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  }

  const effectKind = !isMimic && choice === "gold" ? rollChestEffectKind(rarityKey) : null;
  if (effectKind) {
    const effectDef = effectKind === "blessing"
      ? grantRandomBlessing(interaction.user.id)
      : grantRandomCurse(interaction.user.id);
    const effectReply = await interaction.followUp({ content: buildChestEffectMessage(interaction.user.username, effectDef) });
    setTimeout(() => { void effectReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, effectKind, effectId: effectDef.id }, "Chest effect granted");
  }

  if (!isMimic && (rarityKey === "aur" || rarityKey === "mitic" || rarityKey === "regal")) {
    const inscription = await generateChestInscription(
      CHEST_RARITIES.find((rarity) => rarity.key === rarityKey)?.label ?? rarityKey,
      choice === "gold" ? `${totalGold} Oboli` : choice === "xp" ? `${xpReward} XP` : choice,
    );
    if (inscription) {
      const inscriptionReply = await interaction.followUp({ content: `📜 *${inscription}*` });
      setTimeout(() => { void inscriptionReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    }
  }

  if (!isMimic) {
    await deleteClaimedChestMessage(interaction.message, chestId, "claimed");
  }
  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, effectiveMult, totalGold, choice, pity: pity.pity, mimic: isMimic }, "Chest claimed");
}

async function handleLockedChestClaim(interaction: ButtonInteraction, chestId: string, rarityKey: string, gold: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  const keyType = CHEST_KEY_REQUIRED[rarityKey] as KeyType | undefined;
  if (!keyType) {
    await interaction.followUp({ content: "❌ Cufăr necunoscut.", flags: MessageFlags.Ephemeral });
    return;
  }
  const keyLabel = KEY_LABEL[keyType] ?? "Cheie";
  const sourceLabel = KEY_SOURCE_LABEL[keyType] ?? "cufere comune";

  let usedKeyType: KeyType = keyType;
  let keyConsumed = await consumePlayerKey(interaction.user.id, guildId, keyType);
  if (!keyConsumed) {
    keyConsumed = await consumePlayerKey(interaction.user.id, guildId, "pangarita");
    if (keyConsumed) usedKeyType = "pangarita";
  }
  if (!keyConsumed) {
    await interaction.followUp({
      content:
        `🔒 **Nu ai ${keyLabel}!**\n` +
        `Obți cheia revendicând **${sourceLabel}** — ai noroc la revendicare!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (claimedChests.has(chestId)) {
    await addPlayerKey(interaction.user.id, guildId, usedKeyType);
    await interaction.followUp({
      content: `😔 Cineva a fost mai rapid! **${KEY_LABEL[usedKeyType]}** ți-a fost returnată. Folosește-o la alt cufăr blocat!`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId, LOCKCHEST_DBKEY).catch(() => null);

  const corruptedConsumed = usedKeyType === "pangarita";
  if (corruptedConsumed && Math.random() < 0.25) {
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${chestId}_claimed`)
        .setLabel("Cufărul a fost mistuit")
        .setEmoji("☠️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
    );
    await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
    await interaction.followUp({
      content: "☠️ **Cheia Pângărită s-a consumat**, dar a mistuit și recompensa cufărului. Fumul nu mai poate fi întors.",
      flags: MessageFlags.Ephemeral,
    });
    await deleteClaimedChestMessage(interaction.message, chestId, "corrupted-key");
    return;
  }

  const lockedPlayer = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const lockedEffects = getRewardMultipliers(interaction.user.id, guildId);
  const lockedRmods = {
    goldMult: lockedEffects.goldMult * (lockedPlayer.class === "alchimist" ? 1.2 : 1),
    xpMult: lockedEffects.xpMult * (lockedPlayer.class === "strajer" ? 1.1 : 1),
  };
  const boostedGold = Math.round(gold * lockedRmods.goldMult);
  await addPlayerGold(interaction.user.id, guildId, boostedGold);

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Deschis de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);

  const rarity = CHEST_RARITIES.find((r) => r.key === rarityKey);
  const rarityLabel = rarity?.label ?? rarityKey;
  const boostLine = lockedRmods.goldMult > 1.01 ? ` *(boost ×${lockedRmods.goldMult.toFixed(2)} activ!)*` : "";
  const lockedReply = await interaction.followUp({
    content:
      `🗝️ **${interaction.user.username}** a folosit **${keyLabel}** și a deschis **${rarityLabel}**!\n` +
      `💰 **${boostedGold} Oboli** eliberați din cufărul blocat!${boostLine}`,
  });
  setTimeout(() => { void lockedReply.delete().catch(() => {}); }, CLAIM_TTL_MS);

  const lockedEffectKind = rollChestEffectKind(rarityKey, true);
  if (lockedEffectKind === "blessing") {
    const effectDef = grantRandomBlessing(interaction.user.id);
    const effectReply = await interaction.followUp({ content: buildChestEffectMessage(interaction.user.username, effectDef) });
    setTimeout(() => { void effectReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
    logger.info({ discordId: interaction.user.id, chestId, rarityKey, effectId: effectDef.id }, "Locked chest blessing granted");
  }

  await deleteClaimedChestMessage(interaction.message, chestId, "locked-claimed");
  logger.info({ discordId: interaction.user.id, chestId, rarityKey, gold, keyType }, "Locked chest claimed");
}

async function handleKeyChestClaim(interaction: ButtonInteraction, chestId: string, keyType: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimedChests = getGuildClaimedChests(guildId);

  if (claimedChests.has(chestId)) {
    await ephemeralNote(interaction, "chest", "😔 Cineva a fost mai rapid! Cheia a fost deja luată.");
    return;
  }
  claimedChests.add(chestId);
  void clearActiveChest(guildId, KEYCHEST_DBKEY).catch(() => null);

  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await addPlayerKey(interaction.user.id, guildId, keyType as KeyType);
  void recordPersonalActivity(interaction.user.id, guildId, "keys").catch((err) =>
    logger.warn({ err, discordId: interaction.user.id, guildId }, "Personal key activity update failed"),
  );

  const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${chestId}_claimed`)
      .setLabel(`Luat de ${interaction.user.username}`)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => null);

  const keyChestReply = await interaction.followUp({ content: buildKeyChestClaimMessage(interaction.user.username, keyType) });
  setTimeout(() => { void keyChestReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  await deleteClaimedChestMessage(interaction.message, chestId, "key-claimed");
  logger.info({ discordId: interaction.user.id, chestId, keyType }, "Key chest claimed");
}

async function handleTraderClaim(interaction: ButtonInteraction, rarityKey: string) {
  stopTraderInventoryRefresh(traderViewKey(interaction.guildId!, interaction.user.id));
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;

  const offer = TRADER_OFFERS.find((o) => o.rarityKey === rarityKey);
  if (!offer) {
    await ephemeralNote(interaction, "trader", "❌ Ofertă necunoscută la negustor.");
    return;
  }

  const keyConsumed = await consumePlayerKey(interaction.user.id, guildId, offer.keyType);
  if (!keyConsumed) {
    const keyLabel = KEY_LABEL[offer.keyType] ?? "Cheie";
    await ephemeralNote(
      interaction,
      "trader",
      `🔒 **Nu ai ${keyLabel}!**
Negustorul închide gratiile către tine...
Obți cheia revendicând cufere de chei sau învingând evenimente!`,
    );
    return;
  }

  const success = Math.random() < TRADER_SUCCESS_CHANCE;

  if (!success) {
    const keyLabel = KEY_LABEL[offer.keyType] ?? "Cheie";
    const lines = [
      `💥 **Cheia ta ${keyLabel} s-a rupt în broască!**`,
      `
✨ *Negustorul scutură capul în tăcere...*`,
      `💀 Cheia s-a sfărâmat și comoara rămâne închisă.`,
    ];
    await ephemeralNote(interaction, "trader", lines.join("\n"));
    logger.info({ discordId: interaction.user.id, rarityKey, keyType: offer.keyType, result: "broken" }, "Trader key broke");
    return;
  }

  const result = spawnLockedChest(rarityKey);
  const mult = rollChestMultiplier();
  const traderRmods = getRewardMultipliers(interaction.user.id, guildId);
  if (!result) {
    const baseGold = Math.floor(Math.random() * 200) + 100;
    const gold = Math.round(baseGold * mult * traderRmods.goldMult);
    await addPlayerGold(interaction.user.id, guildId, gold);
    const multEmoji = mult === 3 ? "🔥×3" : mult === 2 ? "✨×2" : "🍀×1";
    const bonusLine = mult > 1 ? `\n🎰 **Multiplicator: ${multEmoji}** \u2014 Norocul Cenușii ține cu tine!` : "";
    await ephemeralNote(interaction, "trader", `🎉 **Cheia a funcționat!** Ai găsit **${gold} Oboli** în cufărul întâmplător!${bonusLine}`);
    logger.info({ discordId: interaction.user.id, rarityKey, gold, mult, result: "success-fallback" }, "Trader success (fallback)");
    return;
  }

  const totalGold = Math.round(result.gold * mult * traderRmods.goldMult);
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await addPlayerGold(interaction.user.id, guildId, totalGold);

  const multEmoji = mult === 3 ? "🔥×3" : mult === 2 ? "✨×2" : "🍀×1";
  const bonusLine = mult > 1
    ? `\n🎰 **Multiplicator ${multEmoji}!** — Cufărul ascundea mai mult decât părea!`
    : "";

  const lines = [
    `🎉 **Cheia ta a funcționat!**`,
    `\n👑 Ai deschis **${offer.emoji} ${offer.label}**!`,
    `💰 **${totalGold} Oboli** eliberați!` +
      (mult > 1 ? ` *(baza: ${result.gold} × ${mult})*` : ""),
    bonusLine,
    `\n✨ *Negustorul închide cufărul cu un zâmbet subțire...*`,
  ];
  await ephemeralNote(interaction, "trader", lines.join("\n"));
  logger.info({ discordId: interaction.user.id, rarityKey, gold: totalGold, baseGold: result.gold, mult, result: "success" }, "Trader chest opened");
}

const TRADER_STYLE_BY_RARITY: Record<string, ButtonStyle> = {
  argint: ButtonStyle.Secondary,
  aur: ButtonStyle.Primary,
  mitic: ButtonStyle.Primary,
  regal: ButtonStyle.Danger,
  cavaler: ButtonStyle.Danger,
};

function traderMainEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc9a227)
    .setAuthor({ name: "Taraba din Umbră • Regatul Cenușii" })
    .setTitle("🏪 Negustorul Misterios al Cenușii")
    .setDescription(
      "*Un bătrân cu pălăria lăsată pe ochi te cântărește din umbră, fără să-și ridice privirea...*\n\n" +
        "> 🗣️ *«Am cufere smulse din lăcomia țarilor morți... dar norocul ți-l vinzi singur.*\n" +
        "> *O cheie pentru un cufăr. Poate se deschide, poate cheia se frânge. Așa-i jocul Cenușii.»*\n\n" +
        "Alege un cufăr de mai jos — **mai întâi îl vei vedea în privat**, apoi decizi dacă îți încerci norocul.",
    )
    .addFields(
      {
        name: "🎲 Norocul Negustorului",
        value:
          "🟢 **30%** — cheia se rotește, cufărul se deschide, Obolii sunt ai tăi.\n" +
          "🔴 **70%** — cheia se frânge în broască și comoara rămâne ferecată.",
      },
      {
        name: "🗝️ Ofertele de azi",
        value:
          "⚙️ **Cufărul Cenușii** — necesită 🗝️ Cheia Umbrei Frânte\n" +
          "🌑 **Cufărul Nocturn** — necesită 🜲 Cheia Cenușii Regale\n" +
          "💀 **Cufărul Oaselor** — necesită 🌙 Cheia Nocturnă\n" +
          "🌀 **Cufărul Fumului** — necesită 🦴 Cheia Oaselor Tăcute\n" +
          "🛡️ **Cufărul Cavalerului** — necesită ❄️ Cheia Fumului Înghețat",
      },
    )
    .setImage(IMG.trader)
    .setFooter({ text: `Selectează un cufăr pentru detalii private • ${BRAND_FOOTER}` });
}

function traderMainRows(): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const offer of TRADER_OFFERS) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`trader_${offer.rarityKey}`)
          .setLabel(`${offer.emoji} ${offer.label}`)
          .setStyle(TRADER_STYLE_BY_RARITY[offer.rarityKey] ?? ButtonStyle.Primary),
      ),
    );
  }
  rows[0]?.addComponents(
    new ButtonBuilder()
      .setCustomId("trader_auction")
      .setLabel("⚒️ Târgul Negru")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("trader_inventory")
      .setLabel("🔑 Cheile mele")
      .setStyle(ButtonStyle.Secondary),
  );
  return rows;
}

function traderMainEmbeds(): EmbedBuilder[] {
  return [traderMainEmbed()];
}

const TRADER_KEY_TYPES: KeyType[] = ["rar", "epic", "regal", "oase", "fum", "cavaler", "pangarita"];
const TRADER_INVENTORY_REFRESH_MS = 10_000;
const TRADER_INVENTORY_REFRESH_TTL_MS = 14 * 60 * 1000;

function traderViewKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function traderKeyInventory(keys: Record<KeyType, number> | null): string {
  return TRADER_KEY_TYPES
    .map((keyType) => `${KEY_EMOJI[keyType] ?? "🗝️"} **${KEY_LABEL[keyType] ?? "Cheie"}**: **${keys?.[keyType] ?? 0}**`)
    .join("\n");
}

function traderInventoryEmbed(keys: Record<KeyType, number> | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc9a227)
    .setTitle("🔑 Inventarul tău de chei")
    .setDescription(
      "Acesta este inventarul tău personal. Îl poți lăsa deschis — se verifică automat la fiecare **10 secunde**.",
    )
    .addFields({
      name: "🗝️ Chei disponibile",
      value: traderKeyInventory(keys),
      inline: false,
    })
    .setImage(IMG.trader)
    .setFooter({ text: `Date private • Actualizare automată la 10 secunde • ${BRAND_FOOTER}` });
}

function traderSelectionEmbed(rarityKey: string, keys: Record<KeyType, number> | null): EmbedBuilder {
  const offer = TRADER_OFFERS.find((item) => item.rarityKey === rarityKey);
  const range = LOCKED_CHEST_GOLD[rarityKey] ?? { min: 0, max: 0 };
  const previewGold = Math.round((range.min + range.max) / 2);
  const chestEmbed = buildLockedChestEmbed(rarityKey, previewGold);
  const keyType = offer?.keyType ?? "rar";
  const selectedKeyCount = keys?.[keyType] ?? 0;
  const selectedKeyLabel = KEY_LABEL[keyType] ?? "Cheie";

  return chestEmbed
    .setDescription(
      `${chestEmbed.data.description ?? ""}\n\n` +
        "🎲 **Decizia este a ta:**\n" +
        "🟢 **Deschide** consumă cheia și îți dă **30% șansă** să eliberezi comoara.\n" +
        "🔴 La eșec, cheia se frânge și nu primești recompensa.\n" +
        "↩️ **Înapoi** te duce la meniul Negustorului fără să consume nimic.",
    )
    .addFields(
      {
        name: "🗝️ Inventarul tău de chei",
        value: traderKeyInventory(keys),
        inline: false,
      },
      {
        name: "🔐 Cheia pentru acest cufăr",
        value: `${KEY_EMOJI[keyType] ?? "🗝️"} **${selectedKeyLabel}**: **${selectedKeyCount}**`,
        inline: false,
      },
    )
    .setFooter({ text: `Ai ales ${offer?.label ?? "cufărul"} • Inventarul se actualizează la 10 secunde • ${BRAND_FOOTER}` });
}

type TraderInventoryRefresh = {
  interaction: ButtonInteraction;
  rarityKey: string | null;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

const traderInventoryRefreshes = new Map<string, TraderInventoryRefresh>();

function stopTraderInventoryRefresh(key: string): void {
  const active = traderInventoryRefreshes.get(key);
  if (!active) return;
  clearTimeout(active.timer);
  traderInventoryRefreshes.delete(key);
}

function scheduleTraderInventoryRefresh(interaction: ButtonInteraction, rarityKey: string | null): void {
  const key = traderViewKey(interaction.guildId!, interaction.user.id);
  stopTraderInventoryRefresh(key);

  const state: TraderInventoryRefresh = {
    interaction,
    rarityKey,
    expiresAt: Date.now() + TRADER_INVENTORY_REFRESH_TTL_MS,
    timer: setTimeout(() => {}, TRADER_INVENTORY_REFRESH_TTL_MS),
  };

  const refresh = async (): Promise<void> => {
    if (traderInventoryRefreshes.get(key) !== state) return;
    if (Date.now() >= state.expiresAt) {
      stopTraderInventoryRefresh(key);
      return;
    }

    const keys = await getPlayerKeys(interaction.user.id, interaction.guildId!).catch((err) => {
      logger.debug({ err, guildId: interaction.guildId }, "Trader key inventory refresh failed");
      return null;
    });

    if (traderInventoryRefreshes.get(key) !== state) return;
    await interaction.editReply({
      embeds: [rarityKey ? traderSelectionEmbed(rarityKey, keys) : traderInventoryEmbed(keys)],
      components: rarityKey ? [traderSelectionRow(rarityKey)] : traderMainRows(),
    }).catch(() => {
      stopTraderInventoryRefresh(key);
    });

    if (traderInventoryRefreshes.get(key) === state) {
      state.timer = setTimeout(() => void refresh(), TRADER_INVENTORY_REFRESH_MS);
    }
  };

  traderInventoryRefreshes.set(key, state);
  state.timer = setTimeout(() => void refresh(), TRADER_INVENTORY_REFRESH_MS);
}

function traderSelectionRow(rarityKey: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trader_open_${rarityKey}`)
      .setLabel("Deschide cufărul")
      .setEmoji("🔓")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("trader_back")
      .setLabel("Înapoi la Negustor")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function handleTraderSelect(interaction: ButtonInteraction, rarityKey: string) {
  stopTraderInventoryRefresh(traderViewKey(interaction.guildId!, interaction.user.id));
  const isPrivateView = interaction.message.flags.has(MessageFlags.Ephemeral);
  if (isPrivateView) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const offer = TRADER_OFFERS.find((item) => item.rarityKey === rarityKey);
  if (!offer) {
    await interaction.editReply({ content: "❌ Cufărul ales nu mai este disponibil." });
    return;
  }

  const keys = await getPlayerKeys(interaction.user.id, interaction.guildId!).catch((err) => {
    logger.warn({ err, guildId: interaction.guildId }, "Could not load trader key inventory");
    return null;
  });

  await interaction.editReply({
    content: `🏪 **Negustorul îți arată în privat ${offer.label}.**`,
    embeds: [traderSelectionEmbed(rarityKey, keys)],
    components: [traderSelectionRow(rarityKey)],
  });
  scheduleTraderInventoryRefresh(interaction, rarityKey);
}

async function handleTraderInventory(interaction: ButtonInteraction) {
  stopTraderInventoryRefresh(traderViewKey(interaction.guildId!, interaction.user.id));
  const isPrivateView = interaction.message.flags.has(MessageFlags.Ephemeral);
  if (isPrivateView) {
    await interaction.deferUpdate();
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const keys = await getPlayerKeys(interaction.user.id, interaction.guildId!).catch((err) => {
    logger.warn({ err, guildId: interaction.guildId }, "Could not load trader key inventory");
    return null;
  });

  await interaction.editReply({
    content: "🏪 **Negustorul îți arată inventarul personal de chei.**",
    embeds: [traderInventoryEmbed(keys)],
    components: traderMainRows(),
  });
  scheduleTraderInventoryRefresh(interaction, null);
}

async function handleTraderBack(interaction: ButtonInteraction) {
  stopTraderInventoryRefresh(traderViewKey(interaction.guildId!, interaction.user.id));
  await interaction.deferUpdate();
  await interaction.editReply({
    content: "🏪 Ai revenit la meniul principal al Negustorului.",
    embeds: traderMainEmbeds(),
    components: traderMainRows(),
  });
}

async function handleJoin(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId!;
  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!" });
    return;
  }
  const pl = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const participant = await joinEvent(guildId, eventId, interaction.user.id, interaction.user.username);
  if (!participant) {
    await interaction.editReply({ content: "⚠️ Eroare la intrarea în event." });
    return;
  }
  if (!participant.isAlive) {
    await interaction.editReply({ embeds: [buildDeathEmbed({ totalDamage: participant.totalDamage, oboli: participant.oboli, xp: participant.xp, baseOboli: participant.baseOboli, baseXp: participant.baseXp, itemsFarmed: participant.itemsFarmed })], components: [] });
    return;
  }
  if (participant.pendingLevelup) {
    const lvl = Math.floor(participant.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  await interaction.editReply({ embeds: [buildCombatEmbed(participant, "", interaction.user.displayAvatarURL({ size: 256 }), pl, getGameplayConfig(guildId))], components: [combatRow(eventId, participant)] });
}

async function handleAttack(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p) {
    await ephemeralNote(interaction, "combat", "❌ Intră mai întâi în luptă!");
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed }) : buildDeathEmbed({ totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }

  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }

  const talismanKey = pl?.talisman ?? null;
  const talismanLevel = pl?.talismanLevel ?? 1;
  const gameplayConfig = getGameplayConfig(guildId);
  const result = doCombat(p, talismanKey, talismanLevel, pl?.bossKills, p.shieldHp);
  const bossFight = isBossFight(p.monsterLevel, p.monsterRarity);
  result.oboliGained = Math.round(result.oboliGained * (bossFight ? gameplayConfig.economy.bossGoldMultiplier : gameplayConfig.economy.monsterGoldMultiplier));
  result.xpGained = Math.round(result.xpGained * (bossFight ? gameplayConfig.economy.bossXpMultiplier : gameplayConfig.economy.monsterXpMultiplier));
  if (result.monsterDefeated) {
    const activityWrites: Promise<void>[] = [
      recordPersonalActivity(p.discordId, guildId, "kills"),
    ];
    if (isBossFight(p.monsterLevel, p.monsterRarity)) {
      activityWrites.push(recordPersonalActivity(p.discordId, guildId, "bosses"));
    }
    void Promise.all(activityWrites).catch((err) =>
      logger.warn({ err, discordId: p.discordId, guildId }, "Personal combat activity update failed"),
    );
  }

  // Ash Shield: the absorbed damage drained the shield's own HP pool inside
  // doCombat; the shield stays up until its HP can't cover an absorption.
  const shieldStillUp = p.shieldNext && !result.shieldBroke;

  // Mana regen: every normal attack restores a % of max mana (base 10%, +2%/regen level).
  const manaMaxNow = maxMana(pl?.manaLevel ?? 0);
  const manaBefore = pl?.mana ?? 0;
  let plAfterMana = await regenPlayerMana(p.discordId, guildId, manaRegenPerAttack(pl?.manaLevel ?? 0, pl?.manaRegenLevel ?? 0), manaMaxNow).catch((err) => {
    logger.error({ err, discordId: p.discordId, guildId }, "regenPlayerMana failed");
    return null;
  }) ?? pl;
  // Actual mana regained this attack (clamped by the max pool).
  const manaGained = Math.max(0, (plAfterMana?.mana ?? manaBefore) - manaBefore);
  // Ash Shield strain: absorbing damage also saps mana (% of the absorbed
  // amount, floors at 0). An empty mana pool never breaks the shield.
  const shieldDrain = result.shieldManaDrained;
  if (shieldDrain > 0) {
    plAfterMana = await drainPlayerMana(p.discordId, guildId, shieldDrain).catch((err) => {
      logger.error({ err, discordId: p.discordId, guildId }, "drainPlayerMana failed");
      return null;
    }) ?? plAfterMana;
  }
  // Veteran ranks: remember every mini-boss this player slays — next time the
  // same boss appears for them, it comes back stronger (+20% HP/dmg per rank).
  const slainBoss = result.monsterDefeated && isBossFight(p.monsterLevel, p.monsterRarity);
  if (slainBoss) {
    void incrementBossKill(p.discordId, guildId, bossIndex(p.monsterLevel))
      .catch((err) => logger.error({ err, discordId: p.discordId, guildId }, "incrementBossKill failed"));
  }
  const killBaseXp = result.xpGained;
  const killBaseOboli = result.oboliGained;

  if (result.oboliGained > 0) {
    const cls = pl?.class && isClassKey(pl.class) ? CLASSES[pl.class] : null;
    if (cls) {
      result.xpGained = Math.round(result.xpGained * cls.xpMult);
      result.oboliGained = Math.round(result.oboliGained * cls.oboliMult);
    }
    const rmods = getRewardMultipliers(p.discordId, guildId);
    result.xpGained = Math.round(result.xpGained * rmods.xpMult);
    result.oboliGained = Math.round(result.oboliGained * rmods.goldMult);
    if (talismanKey === "piatra_eco") {
      result.xpGained = Math.round(result.xpGained * (1 + talismanValue("piatra_eco", talismanLevel) / 100));
    }
    // Prestige gold bonus: +5% Oboli per prestige level
    result.oboliGained = Math.round(result.oboliGained * prestigeGoldMult(pl?.prestigeLevel ?? 0));
  }

  // Roll item drop before buildResultText so the drop line can appear in the combat embed
  const itemDrop = result.oboliGained > 0 ? rollItemDrop(p.monsterLevel) : null;
  // Rarity material: rar/epic/legendar/mitic monsters and mini-bossi drop their tier material
  const materialDrop = result.monsterDefeated ? rollMaterialDrop(p.monsterRarity) : null;
  const equipmentMaterialDrop = result.monsterDefeated
    ? rollEquipmentMaterialDrop(p.monsterRarity)
    : null;
  const equipmentDrop = result.monsterDefeated
    ? rollEquipmentDrop(p.monsterLevel, p.monsterRarity)
    : null;
  const corruptedKeyDrop = result.monsterDefeated && randomCorruptedKeyDrop();
  // Track everything farmed this event so the final summary can show it
  const itemsFarmed: Record<string, number> = { ...(p.itemsFarmed ?? {}) };
  if (itemDrop) itemsFarmed[itemDrop] = (itemsFarmed[itemDrop] ?? 0) + 1;
  if (materialDrop) itemsFarmed[materialDrop] = (itemsFarmed[materialDrop] ?? 0) + 1;
  if (equipmentMaterialDrop) itemsFarmed[equipmentMaterialDrop] = (itemsFarmed[equipmentMaterialDrop] ?? 0) + 1;
  if (equipmentDrop) itemsFarmed[equipmentDrop] = (itemsFarmed[equipmentDrop] ?? 0) + 1;
  const cristaHeal =
    result.oboliGained > 0 && !result.playerDied && talismanKey === "crista_vietii"
      ? talismanValue("crista_vietii", talismanLevel)
      : 0;
  const manaFlowLine = (() => {
    const parts: string[] = [];
    if (manaGained > 0) parts.push(`+**${manaGained}** (regenerare)`);
    if (shieldDrain > 0) parts.push(`−**${shieldDrain}** (efortul scutului)`);
    if (parts.length === 0) return "";
    return `\n🔷 Mană: ${parts.join(", ")} → **${plAfterMana?.mana ?? 0}/${manaMaxNow}**`;
  })();
  const extra =
    buildResultText(result, itemDrop, { baseXp: killBaseXp, baseOboli: killBaseOboli, cristaHeal }) +
    manaFlowLine +
    (materialDrop ? `\n${ITEMS[materialDrop].emoji} **${ITEMS[materialDrop].label}** a căzut din monstru — material de evoluție!` : "") +
    (equipmentMaterialDrop ? `\n${ITEMS[equipmentMaterialDrop].emoji} **${ITEMS[equipmentMaterialDrop].label}** a căzut din monstru — material de echipament!` : "") +
    (equipmentDrop ? `\n✨ ${ITEMS[equipmentDrop].emoji} **${ITEMS[equipmentDrop].label}** a căzut din monstru!` : "") +
    (corruptedKeyDrop ? "\n☠️ **Cheia Pângărită** a ieșit din cenușă!" : "");

  if (result.playerDied) {
    const lost = Math.floor(p.oboli * 0.2);
    const deathBaseOboli = p.baseOboli;
    const deathBaseXp = p.baseXp;
    await updateParticipant(p.id, { isAlive: false, currentHp: 0, empowerNext: false, shieldNext: false, shieldHp: 0 });
    await Promise.all([
      deductPlayerGold(p.discordId, guildId, lost),
      recordPlayerDeath(p.discordId, guildId, p.monsterLevel),
    ]);
    await interaction.editReply({ embeds: [buildDeathEmbed({ lostOboli: lost, totalDamage: p.totalDamage + result.playerDmg, oboli: p.oboli, xp: p.xp, baseOboli: deathBaseOboli, baseXp: deathBaseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }

  // crista_vietii: +HP after kill; runa_sangelui: life steal on crit
  let finalPlayerHp = result.newPlayerHp;
  if (cristaHeal > 0) {
    finalPlayerHp = Math.min(p.maxHp, finalPlayerHp + cristaHeal);
  } else if (result.hpRegen > 0) {
    finalPlayerHp = Math.min(p.maxHp, finalPlayerHp + result.hpRegen);
  }

  if (result.oboliGained > 0) {
    // Daily quests: every kill counts; rare+ kills and mini-boss kills track extra quests
    const questKeys: DailyQuestKey[] = ["kill_10"];
    if (p.monsterRarity && p.monsterRarity !== "comun") questKeys.push("rare_3");
    if (p.monsterRarity === "boss") questKeys.push("boss_1");
    const questResults = await Promise.all(
      questKeys.map((k) => incrementDailyQuest(p.discordId, guildId, k, dailyQuestDefinitions(gameplayConfig)[k].target)),
    );
    const completedQuests = questKeys.filter((_, i) => questResults[i]!.justCompleted);
    void Promise.all([
      addPlayerGold(p.discordId, guildId, result.oboliGained),
      addPlayerXp(p.discordId, guildId, result.xpGained),
      updateMaxLevel(p.discordId, guildId, result.newMonsterLevel),
      ...(itemDrop ? [addPlayerItem(p.discordId, guildId, itemDrop)] : []),
      ...(materialDrop ? [addPlayerItem(p.discordId, guildId, materialDrop)] : []),
      ...(equipmentMaterialDrop ? [addPlayerItem(p.discordId, guildId, equipmentMaterialDrop)] : []),
      ...(equipmentDrop
        ? [grantEquipment(p.discordId, guildId, equipmentDrop)]
        : []),
      ...(corruptedKeyDrop ? [addPlayerKey(p.discordId, guildId, "pangarita")] : []),
      ...completedQuests.map((k) => addPlayerItem(p.discordId, guildId, DAILY_QUESTS[k].reward.itemKey, dailyQuestDefinitions(gameplayConfig)[k].reward.qty)),
    ]).catch((err) => logger.error({ err, discordId: p.discordId, guildId }, "Async combat writes failed"));
    if (completedQuests.length > 0) {
      void recordPersonalActivity(p.discordId, guildId, "quests", completedQuests.length).catch((err) =>
        logger.warn({ err, discordId: p.discordId, guildId }, "Personal quest activity update failed"),
      );
      const rewardLines = completedQuests.map((k) => {
        const q = dailyQuestDefinitions(gameplayConfig)[k];
        itemsFarmed[q.reward.itemKey] = (itemsFarmed[q.reward.itemKey] ?? 0) + q.reward.qty;
        return `${q.emoji} **${q.label}** — ai primit ${ITEMS[q.reward.itemKey].emoji} **${q.reward.qty}× ${ITEMS[q.reward.itemKey].label}**!`;
      });
      void interaction.followUp({
        content:
          `📜 **Misiune zilnică completată!**\n` +
          rewardLines.join("\n") +
          `\nFolosește \`/misiuni\` pentru detalii.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (result.levelUp) {
    await updateParticipant(p.id, {
      currentHp: finalPlayerHp,
      monsterLevel: result.newMonsterLevel,
      monsterCurrentHp: monsterSpawnHp(result.newMonsterLevel, result.newMonsterRarity, pl?.bossKills),
      monsterRarity: result.newMonsterRarity,
      totalDamage: p.totalDamage + result.playerDmg,
      oboli: p.oboli + result.oboliGained,
      xp: p.xp + result.xpGained,
      baseOboli: p.baseOboli + killBaseOboli,
      baseXp: p.baseXp + killBaseXp,
      itemsFarmed,
      pendingLevelup: true,
      empowerNext: false,
      shieldNext: shieldStillUp,
      shieldHp: shieldStillUp ? result.shieldHpLeft : 0,
      bossCharge: result.newBossCharge,
    });
    const lvlDropParts = [
      ...(itemDrop ? [`${ITEMS[itemDrop].emoji} **${ITEMS[itemDrop].label}** a căzut din monstru!`] : []),
      ...(materialDrop ? [`${ITEMS[materialDrop].emoji} **${ITEMS[materialDrop].label}** a căzut din monstru — material de evoluție!`] : []),
      ...(equipmentDrop ? [`✨ ${ITEMS[equipmentDrop].emoji} **${ITEMS[equipmentDrop].label}** a căzut din monstru!`] : []),
    ];
    const lvlDropLine = lvlDropParts.length > 0 ? lvlDropParts.join("\n") : undefined;
    await interaction.editReply({
      embeds: [
        buildLevelupEmbed(Math.floor(result.newMonsterLevel / LEVELUP_INTERVAL), lvlDropLine),
        ...(equipmentDrop ? [buildEquipmentLootEmbed(equipmentDrop)] : []),
      ],
      components: levelupRows(eventId),
    });
    return;
  }

  const updated = await updateParticipant(p.id, {
    currentHp: finalPlayerHp,
    monsterLevel: result.newMonsterLevel,
    monsterCurrentHp: result.newMonsterHp,
    monsterRarity: result.newMonsterRarity,
    totalDamage: p.totalDamage + result.playerDmg,
    oboli: p.oboli + result.oboliGained,
    xp: p.xp + result.xpGained,
    baseOboli: p.baseOboli + killBaseOboli,
    baseXp: p.baseXp + killBaseXp,
    itemsFarmed,
    empowerNext: false,
    shieldNext: shieldStillUp,
    shieldHp: shieldStillUp ? result.shieldHpLeft : 0,
    bossCharge: result.newBossCharge,
  });

  await interaction.editReply({
    embeds: [
      buildCombatEmbed(updated, extra, interaction.user.displayAvatarURL({ size: 256 }), plAfterMana, gameplayConfig),
      ...(equipmentDrop ? [buildEquipmentLootEmbed(equipmentDrop)] : []),
    ],
    components: [combatRow(eventId, updated)],
  });
}

async function handleRetreat(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await getParticipant(eventId, guildId, interaction.user.id);
  if (!p) {
    await ephemeralNote(interaction, "combat", "❌ Nu ești în nicio luptă!");
    return;
  }
  if (!p.isAlive) {
    await interaction.editReply({ embeds: [p.fled ? buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed }) : buildDeathEmbed({ totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
    return;
  }
  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  await updateParticipant(p.id, { isAlive: false, fled: true });
  await recordPlayerRetreat(p.discordId, guildId, p.monsterLevel);
  await interaction.editReply({ embeds: [buildRetreatEmbed(p.monsterLevel, { totalDamage: p.totalDamage, oboli: p.oboli, xp: p.xp, baseOboli: p.baseOboli, baseXp: p.baseXp, itemsFarmed: p.itemsFarmed })], components: [] });
}

async function handleBuy(interaction: ButtonInteraction, key: ShopKey) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = shopPrice(key, p[SHOP_COUNT_KEY[key]] as number);
  const updated = await buyPlayerUpgrade(interaction.user.id, guildId, key, cost);
  if (updated) {
    await applyUpgradeToActiveParticipant(interaction.user.id, guildId, key);
  }
  const player = updated ?? p;
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(player, "stats", items)], components: shopStatsRows(player) });
}

async function handleLevelup(interaction: ButtonInteraction, eventId: number, bonus: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p || !p.isAlive || !p.pendingLevelup) {
    await ephemeralNote(interaction, "combat", "❌ Nu ai un level-up disponibil!");
    return;
  }

  const bonusMap: Record<string, Partial<typeof p>> = {
    xp: { xpPerKill: p.xpPerKill + 5 },
    dodge: { dodgeBonus: p.dodgeBonus + 3 },
    atac: { attackBonus: p.attackBonus + 2 },
    hp: { maxHp: p.maxHp + 5, currentHp: Math.min(p.maxHp + 5, p.currentHp + 5) },
    crit: { critBonus: p.critBonus + 1 },
  };

  const bonusValues = bonusMap[bonus] ?? {};
  const updated = await updateParticipant(p.id, { ...bonusValues, pendingLevelup: false });
  await interaction.editReply({ embeds: [buildCombatEmbed(updated, "✨ **Bonus ales! Umbrele îți recunosc puterea.**", interaction.user.displayAvatarURL({ size: 256 }), pl, getGameplayConfig(guildId))], components: [combatRow(eventId, updated)] });
}

async function handleClasa(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({
    embeds: [buildClassEmbed(p, items)],
    components: p.class && isClassKey(p.class) ? shopClassRows(p, items) : classRows(),
  });
}

async function handleClassPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, guildId, key, CLASS_SWITCH_COST);
  if (!updated) {
    const cur = await getPlayerById(interaction.user.id, guildId);
    if (!p.class && Object.keys(p.classLevels ?? {}).length > 0) {
      await interaction.followUp({
        content: `❌ Instruirea unei noi căi costă **${CLASS_SWITCH_COST} Oboli** — nu ai destui.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.editReply({
      embeds: [cur ? buildClassEmbed(cur) : buildClassEmbed({ class: null } as never)],
      components: [],
    });
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildClassEmbed(updated, items)], components: shopClassRows(updated, items) });
}

async function handleCompanion(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({
    embeds: [buildCompanionEmbed(p)],
    components: [],
  });
}

async function handleShopNavStats(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "stats", items)], components: shopStatsRows(p) });
}

async function handleShopNavComp(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "comp", items)], components: shopCompRows(p) });
}

async function handleShopNavAbil(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "abil", items)], components: shopAbilRows(p) });
}

async function handleShopNavPrestige(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "prestige")], components: shopPrestigeRows(p) });
}

async function handleShopNavClass(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "class", items)], components: shopClassRows(p, items) });
}

async function handleShopNavEquipment(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({
    embeds: [buildShopEmbed(p, "equipment", items)],
    components: shopEquipmentRows(p),
  });
}

async function handleEquipmentPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  if (!isEquipmentKey(key)) return;
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  await interaction.editReply({
    embeds: [buildEquipmentDetailEmbed(p, key, items)],
    components: shopEquipmentDetailRows(p, key, items),
  });
}

async function handleEquipmentEquip(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  if (!isEquipmentKey(key)) return;
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (equipmentLevel(p, key) < 1) {
    await ephemeralNote(interaction, "equipment", "❌ Deblochează mai întâi acest obiect.");
    return;
  }
  const updated = await equipEquipment(interaction.user.id, guildId, key);
  if (!updated) {
    await ephemeralNote(interaction, "equipment", "❌ Obiectul nu mai este disponibil pentru echipare.");
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({
    embeds: [buildEquipmentDetailEmbed(updated, key, items)],
    components: shopEquipmentDetailRows(updated, key, items),
  });
  await ephemeralNote(interaction, "equipment", `✅ **${EQUIPMENT[key].label}** este echipat pentru următoarea luptă.`);
}

async function handleEquipmentUpgrade(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  if (!isEquipmentKey(key)) return;
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  const fromLevel = equipmentLevel(p, key);
  const cost = equipmentCost(key, fromLevel + 1);
  const itemCosts = cost.items.map((req) => ({ item: req.item, qty: req.qty }));
  const updated = fromLevel === 0
    ? await buyEquipment(interaction.user.id, guildId, key, cost.gold, itemCosts)
    : await upgradeEquipment(interaction.user.id, guildId, key, fromLevel, cost.gold, cost.xp, itemCosts);
  if (!updated) {
    await ephemeralNote(
      interaction,
      "equipment",
      `❌ Nu ai suficiente resurse pentru ${fromLevel === 0 ? "deblocare" : "upgrade"} sau obiectul a fost actualizat deja.`,
    );
    return;
  }
  const updatedItems = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({
    embeds: [buildEquipmentDetailEmbed(updated, key, updatedItems)],
    components: shopEquipmentDetailRows(updated, key, updatedItems),
  });
  await ephemeralNote(interaction, "equipment", `✅ **${EQUIPMENT[key].label}** a ajuns la nivelul **${equipmentLevel(updated, key)}**.`);
}

/** Build savedLevels map (talismanKey → level) from player_talismans rows. */
function talismanLevelsMap(rows: { talismanKey: string; level: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.talismanKey, r.level]));
}

async function handleShopNavTalisman(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items, saved] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevels = talismanLevelsMap(saved);
  await interaction.editReply({ embeds: [buildTalismanPage(p, items, savedLevels)], components: shopTalismanRows(p, items, savedLevels) });
}

async function handleShopTalismanPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  if (!isTalismanKey(key)) return;
  const [p, saved] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const t = TALISMANS[key];
  if (p.talisman === key) return;
  const savedLevels = talismanLevelsMap(saved);
  const owned = (savedLevels[key] ?? 0) > 0;
  if (!owned) {
    // Atomic deduct (WHERE gold >= price) — a double-click can't pay twice or overdraw
    const paid = await tryDeductPlayerGold(interaction.user.id, guildId, t.price);
    if (!paid) {
      await interaction.followUp({
        content: `❌ Nu ai suficienți Oboli! Ai **${p.gold}** / **${t.price}** Oboli.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  // Save the level of the talisman being unequipped so it's never lost
  if (p.talisman && isTalismanKey(p.talisman)) {
    await saveTalismanLevel(interaction.user.id, guildId, p.talisman, p.talismanLevel ?? 1);
  }
  // Equip at the previously saved level (1 for a fresh purchase) and record ownership
  const newLevel = savedLevels[key] ?? 1;
  await Promise.all([
    equipTalisman(interaction.user.id, guildId, key, newLevel),
    saveTalismanLevel(interaction.user.id, guildId, key, newLevel),
  ]);
  const [updated, items, savedAfter] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevelsAfter = talismanLevelsMap(savedAfter);
  await interaction.editReply({ embeds: [buildTalismanPage(updated, items, savedLevelsAfter)], components: shopTalismanRows(updated, items, savedLevelsAfter) });
}

async function handleShopTalismanUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, items] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
  ]);
  const equippedKey = p.talisman && isTalismanKey(p.talisman) ? p.talisman : null;
  const fromLevel = p.talismanLevel ?? 1;
  if (!equippedKey) {
    await ephemeralNote(interaction, "shop", "❌ Nu poți evolua acest talisman.");
    return;
  }
  const t = TALISMANS[equippedKey];
  const cost = talismanUpgradeCost(equippedKey, fromLevel);
  const ok = await consumePlayerItems(interaction.user.id, guildId, {
    [cost.common]: cost.commonQty,
    [cost.rare]: cost.rareQty,
    ...(cost.tier ? { [cost.tier]: cost.tierQty } : {}),
  });
  if (!ok) {
    await ephemeralNote(interaction, "shop", "❌ Nu ai materialele necesare pentru evoluție.");
    return;
  }
  // Atomic level guard: only write fromLevel+1 if THIS talisman is still equipped at fromLevel
  // (prevents double-upgrade race and the bump landing on a concurrently-switched talisman)
  const upgraded = await tryUpgradeTalismanLevel(interaction.user.id, guildId, equippedKey, fromLevel, fromLevel + 1);
  if (!upgraded) {
    // Another concurrent click already upgraded — refund the consumed items
    await Promise.all([
      addPlayerItem(interaction.user.id, guildId, cost.common, cost.commonQty),
      addPlayerItem(interaction.user.id, guildId, cost.rare, cost.rareQty),
      ...(cost.tier ? [addPlayerItem(interaction.user.id, guildId, cost.tier, cost.tierQty)] : []),
    ]);
    await ephemeralNote(interaction, "shop", "❌ Talismanul a fost deja evoluat.");
    return;
  }
  // Persist the new level per-talisman so it survives switching
  await saveTalismanLevel(interaction.user.id, guildId, equippedKey, fromLevel + 1);
  const [updated, updatedItems, savedAfter] = await Promise.all([
    upsertPlayer(interaction.user.id, guildId, interaction.user.username),
    getPlayerItems(interaction.user.id, guildId),
    getPlayerTalismans(interaction.user.id, guildId),
  ]);
  const savedLevelsAfter = talismanLevelsMap(savedAfter);
  await ephemeralNote(interaction, "shop", `✨ **${t.label}** a evoluat la **Nv.${fromLevel + 1}**! Pasivul tău este acum mai puternic.`);
  await interaction.editReply({ embeds: [buildTalismanPage(updated, updatedItems, savedLevelsAfter)], components: shopTalismanRows(updated, updatedItems, savedLevelsAfter) });
}

async function handleShopClassPick(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const updated = await setPlayerClass(interaction.user.id, guildId, key, CLASS_SWITCH_COST);
  const player = updated ?? (await getPlayerById(interaction.user.id, guildId));
  if (!player) return;
  if (!updated) {
    const msg = player.class
      ? "❌ Ai deja o clasă aleasă. Dacă vrei alta, renunță mai întâi la calea ta din **/magazin → Clasă**."
      : `❌ Instruirea unei noi căi costă **${CLASS_SWITCH_COST} Oboli** — nu ai destui.`;
    await ephemeralNote(interaction, "shop", msg);
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({
    embeds: [buildShopEmbed(player, "class", items)],
    components: shopClassRows(player, items),
  });
}

async function handlePrestigeBuy(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = prestigeXpCost(p.prestigeLevel);
  const updated = await buyPrestige(interaction.user.id, guildId, p.prestigeLevel, cost);
  const player = updated ?? p;
  await interaction.editReply({ embeds: [buildShopEmbed(player, "prestige")], components: shopPrestigeRows(player) });
}

async function handleShopBack(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  await interaction.editReply({ embeds: [buildShopEmbed(p, "overview")], components: shopRows(p) });
}

async function handleCompBuy(interaction: ButtonInteraction, key: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isCompanionKey(key)) return;
  const updated = await buyCompanion(interaction.user.id, guildId, key, COMPANION_BUY_COST);
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Nu poți cumpăra acest companion — ai nevoie de **${COMPANION_BUY_COST} Oboli** și să nu ai deja unul.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp", items)], components: shopCompRows(updated) });
}

async function handleCompUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const cost = upgradeCost(p.companionLevel);
  const updated = await upgradeCompanion(interaction.user.id, guildId, p.companionLevel, cost, UPGRADE_XP_COST);
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Îmbunătățire eșuată — ai nevoie de un companion, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "comp", items)], components: shopCompRows(updated) });
}

async function handleClassUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.class || !isClassKey(p.class)) {
    await ephemeralNote(interaction, "shop", "❌ Nu ai o clasă aleasă. Folosește `/clasa` pentru a alege una.");
    return;
  }
  const level = p.classLevel ?? 1;
  const cost = classUpgradeCost(level);
  const items = await getPlayerItems(interaction.user.id, guildId);
  const inv = Object.fromEntries(items.map((i) => [i.itemKey, i.quantity]));
  const canAfford =
    p.gold >= cost.gold &&
    p.xp >= cost.xp &&
    cost.items.every((req) => (inv[req.item] ?? 0) >= req.qty);
  if (!canAfford) {
    const itemLines = cost.items.map((req) => `   · ${req.qty}× ${ITEMS[req.item].emoji} ${ITEMS[req.item].label}`).join("\n");
    await ephemeralNote(interaction, "shop", `❌ Resurse insuficiente pentru upgrade la Nv.${level + 1}.\n\n**Cost:**\n   · ${cost.gold} Oboli\n   · ${cost.xp} XP${itemLines ? "\n" + itemLines : ""}`);
    return;
  }
  const updated = await upgradeClass(interaction.user.id, guildId, p.class, level, cost.gold, cost.xp, cost.items);
  if (!updated) {
    await ephemeralNote(interaction, "shop", "❌ Upgrade eșuat — resursele s-au schimbat între timp.");
    return;
  }
  const updatedItems = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({
    embeds: [buildClassEmbed(updated, updatedItems)],
    components: shopClassRows(updated, updatedItems),
  });
}

async function handleCompReset(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.companion || !isCompanionKey(p.companion)) {
    await interaction.followUp({ content: "❌ Nu ai niciun companion de eliberat.", flags: MessageFlags.Ephemeral });
    return;
  }
  const c = COMPANIONS[p.companion];
  await interaction.followUp({
    content:
      `⚠️ Ești sigur că vrei să eliberezi companionul ${c.emoji} **${c.label}** (Nv.${p.companionLevel})?\n` +
      `Nivelul lui se **pierde definitiv** și nu primești Oboli înapoi. Vei putea cumpăra alt companion (${COMPANION_BUY_COST} Oboli).`,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("shop_compreset_yes").setLabel("Da, eliberează").setEmoji("🔄").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_reset_no").setLabel("Anulează").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleClassReset(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!p.class || !isClassKey(p.class)) {
    await interaction.followUp({ content: "❌ Nu ai nicio clasă aleasă.", flags: MessageFlags.Ephemeral });
    return;
  }
  const cls = CLASSES[p.class];
  await interaction.followUp({
    content:
      `⚠️ Ești sigur că vrei să renunți la calea ${cls.emoji} **${cls.label}** (Nv.${p.classLevel ?? 1})?\n` +
      `Nivelul ei se **păstrează** și îl recuperezi dacă revii la această cale. Instruirea unei căi noi costă **${CLASS_SWITCH_COST} Oboli**.`,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("shop_classreset_yes").setLabel("Da, renunț").setEmoji("🔄").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("shop_reset_no").setLabel("Anulează").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleCompResetConfirm(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const updated = await resetPlayerCompanion(interaction.user.id, guildId);
  if (!updated) {
    await interaction.editReply({ content: "❌ Nu mai ai niciun companion de eliberat.", components: [] });
    return;
  }
  await interaction.editReply({
    content: "🔄 Companionul a fost eliberat. Poți cumpăra unul nou din **/magazin → Companion**.",
    components: [],
  });
}

async function handleClassResetConfirm(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const updated = await resetPlayerClass(interaction.user.id, guildId);
  if (!updated) {
    await interaction.editReply({ content: "❌ Nu mai ai nicio clasă de resetat.", components: [] });
    return;
  }
  await interaction.editReply({
    content: `🔄 Ai renunțat la calea ta — nivelul ei rămâne salvat. Poți alege o cale nouă din **/magazin → Clasă** sau cu \`/clasa\` (taxă de instruire: **${CLASS_SWITCH_COST} Oboli**).`,
    components: [],
  });
}

async function handleResetCancel(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  await interaction.editReply({ content: "✅ Anulat — totul rămâne neschimbat.", components: [] });
}

async function handleAbilBuy(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isClassPowerSlot(kind) || !p.class || !isClassKey(p.class)) {
    await ephemeralNote(interaction, "shop", "❌ Alege mai întâi o clasă pentru a debloca puterile ei.");
    return;
  }
  const updated = await buyClassPower(interaction.user.id, guildId, p.class, kind, ABILITY_BUY_COST);
  if (updated) {
    const lvl = classPowerLevel(updated, p.class, kind);
    await applyClassPowerLevelToActiveParticipant(interaction.user.id, guildId, kind, lvl);
  }
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Nu poți debloca puterea — ai nevoie de **${ABILITY_BUY_COST} Oboli** și să nu o deții deja.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil", items)], components: shopAbilRows(updated) });
}

async function handleAbilUpgrade(interaction: ButtonInteraction, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  if (!isClassPowerSlot(kind) || !p.class || !isClassKey(p.class)) {
    await ephemeralNote(interaction, "shop", "❌ Alege mai întâi o clasă pentru a îmbunătăți puterile ei.");
    return;
  }
  const curLvl = classPowerLevel(p, p.class, kind);
  const cost = upgradeCost(curLvl);
  const updated = await upgradeClassPower(interaction.user.id, guildId, p.class, kind, curLvl, cost, UPGRADE_XP_COST);
  if (updated) {
    const lvl = classPowerLevel(updated, p.class, kind);
    await applyClassPowerLevelToActiveParticipant(interaction.user.id, guildId, kind, lvl);
  }
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Îmbunătățire eșuată — ai nevoie de putere, **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil", items)], components: shopAbilRows(updated) });
}

async function handleManaUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const curLvl = p.manaLevel ?? 0;
  const cost = manaUpgradeCost(curLvl);
  const updated = await upgradeMana(interaction.user.id, guildId, curLvl, cost, UPGRADE_XP_COST, maxMana(curLvl + 1));
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Îmbunătățire eșuată — ai nevoie de **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil", items)], components: shopAbilRows(updated) });
  await ephemeralNote(interaction, "shop", `🔷 **Rezerva de Mană** a crescut la **Nv.${updated.manaLevel}** — mana maximă e acum **${maxMana(updated.manaLevel)}** (și a fost reumplută complet)!`);
}

async function handleManaRegenUpgrade(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const p = await upsertPlayer(interaction.user.id, guildId, interaction.user.username);
  const curLvl = p.manaRegenLevel ?? 0;
  const cost = manaRegenUpgradeCost(curLvl);
  const updated = await upgradeManaRegen(interaction.user.id, guildId, curLvl, cost, UPGRADE_XP_COST);
  if (!updated) {
    await ephemeralNote(interaction, "shop", `❌ Îmbunătățire eșuată — ai nevoie de **${cost} Oboli** și **${UPGRADE_XP_COST} XP**.`);
    return;
  }
  const items = await getPlayerItems(interaction.user.id, guildId);
  await interaction.editReply({ embeds: [buildShopEmbed(updated, "abil", items)], components: shopAbilRows(updated) });
  await ephemeralNote(interaction, "shop", `💠 **Regenerarea de Mană** a crescut la **Nv.${updated.manaRegenLevel}** — fiecare atac normal reface acum **${manaRegenPct(updated.manaRegenLevel)}%** din mana maximă!`);
}

async function handleAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const [p, pl] = await Promise.all([
    getParticipant(eventId, guildId, interaction.user.id),
    getPlayerById(interaction.user.id, guildId),
  ]);
  if (!p || !p.isAlive) {
    await ephemeralNote(interaction, "ability", "❌ Trebuie să fii în luptă ca să folosești abilități!");
    return;
  }
  if (p.pendingLevelup) {
    const lvl = Math.floor(p.monsterLevel / LEVELUP_INTERVAL);
    await interaction.editReply({ embeds: [buildLevelupEmbed(lvl)], components: levelupRows(eventId) });
    return;
  }
  const ev = await getActiveEvent(eventId, guildId);
  if (!ev || !ev.isActive || ev.expiresAt.getTime() < Date.now()) {
    await interaction.editReply({ content: "⌛ Ora Umbrelor s-a încheiat!", embeds: [], components: [] });
    return;
  }
  const slot: ClassPowerSlot = kind === "shield" ? "power2" : "power1";
  const power = classPowerFor(p.classKey, slot);
  const abilityLevel = p.classKey && isClassKey(p.classKey) && pl
    ? classPowerLevel(pl, p.classKey, slot)
    : (kind === "shield" ? p.shieldLevel : p.empowerLevel);
  if (abilityLevel < 1) {
    await ephemeralNote(interaction, "ability", `🔒 Nu deții **${power?.label ?? "această putere"}**. O poți debloca din Forja Cenușii → **Puteri**.`);
    return;
  }
  if (kind === "shield" && p.shieldNext) {
    const sMax = shieldMaxHp(Math.max(1, abilityLevel));
    await ephemeralNote(interaction, "ability", `${power?.emoji ?? "🛡️"} **${power?.label ?? "Puterea defensivă"} e deja activă!** Rămâne ridicată cât timp viața ei acoperă daunele absorbite.\n🛡️ Viața scutului: **${p.shieldHp ?? 0}/${sMax}** ${shieldBar(p.shieldHp ?? 0, sMax)}`);
    return;
  }
  const cost = kind === "shield" ? SHIELD_ACTIVATION_COST : abilityManaCost(abilityLevel);
  const plMana = await spendPlayerMana(interaction.user.id, guildId, cost);
  if (!plMana) {
    const curMana = pl?.mana ?? 0;
    const maxM = maxMana(pl?.manaLevel ?? 0);
    await ephemeralNote(interaction, "ability", `🔷 **Mană insuficientă!** Abilitatea costă **${cost}** mană, tu ai **${curMana}/${maxM}** ${manaBar(curMana, maxM)}\n⚔️ Atacă normal ca să îți refaci mana (+${manaRegenPct(pl?.manaRegenLevel ?? 0)}% pe atac).`);
    return;
  }

  const shieldPool = shieldMaxHp(Math.max(1, abilityLevel));
  const abilityFlags = kind === "shield" ? { shieldNext: true, shieldHp: shieldPool } : { empowerNext: true };
  const note = (kind === "shield"
    ? `${power?.emoji ?? "🛡️"} **${power?.label ?? "Puterea defensivă"} ridicată!** Absoarbe **${Math.round(shieldReduction(abilityLevel) * 100)}%** din fiecare lovitură — daunele absorbite se scad din viața scutului **și consumă mană** (**${shieldManaDrainPct(abilityLevel)}%** din daunele absorbite; mana goală NU sparge scutul). Rămâne activă până când viața ei se termină.\n🛡️ Viața scutului: **${shieldPool}/${shieldPool}** ${shieldBar(shieldPool, shieldPool)}`
    : `${power?.emoji ?? "⚔️"} **${power?.label ?? "Puterea ofensivă"} pregătită!** Următoarea ta lovitură va fi amplificată.`) +
    `\n🔷 −**${cost}** mană`;
  const updated = await updateParticipant(p.id, abilityFlags);
  await interaction.editReply({
    embeds: [buildCombatEmbed(updated, note, interaction.user.displayAvatarURL({ size: 256 }), plMana, getGameplayConfig(guildId))],
    components: [combatRow(eventId, updated)],
  });
}

// ─── Per-player ephemeral "hit reply" anti-spam ───────────────────────────────
// Instead of posting a new ephemeral message on every Dragon click, we edit the
// player's previous one. Ephemeral messages can only be edited through the
// webhook of the interaction that created them, and that token lives ~15 min,
// so we keep the webhook + message id in memory and fall back to a fresh
// message when the token has expired or the edit fails.
const HIT_REPLY_TTL_MS = 14 * 60 * 1000;
// How long we keep EDITING the same ephemeral reply before rolling to a fresh
// one. Short on purpose: if the player dismissed the ephemeral, edits land in
// the void — after this window a fresh (visible) message is posted and the
// stale one is deleted, so replies can't "disappear forever" nor pile up.
const HIT_REPLY_EDIT_WINDOW_MS = 60 * 1000;
const HIT_REPLY_MAP_CAP = 1000;
const bossHitReplies = new Map<string, { webhook: ButtonInteraction["webhook"]; messageId: string; expiresAt: number; freshUntil: number }>();
// Per-key promise chain so burst clicks from the same player serialize instead
// of racing (which would occasionally post duplicate ephemerals).
const hitReplyLocks = new Map<string, Promise<void>>();

async function sendOrEditEphemeral(interaction: ButtonInteraction, key: string, content: string): Promise<void> {
  const run = async () => {
    const prev = bossHitReplies.get(key);
    if (prev) {
      if (prev.expiresAt > Date.now() && prev.freshUntil > Date.now()) {
        const edited = await prev.webhook.editMessage(prev.messageId, { content }).catch(() => null);
        if (edited) return;
      }
      // Rolling to a fresh message: clean up the old ephemeral so dismissed or
      // stale replies don't linger in the player's chat.
      if (prev.expiresAt > Date.now()) {
        void prev.webhook.deleteMessage(prev.messageId).catch(() => null);
      }
      bossHitReplies.delete(key);
    }
    const msg = await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    if (msg) {
      // Bounded map: drop expired entries first, then oldest-inserted if still over cap.
      if (bossHitReplies.size >= HIT_REPLY_MAP_CAP) {
        const now = Date.now();
        for (const [k, v] of bossHitReplies) if (v.expiresAt <= now) bossHitReplies.delete(k);
        while (bossHitReplies.size >= HIT_REPLY_MAP_CAP) {
          const oldest = bossHitReplies.keys().next().value;
          if (oldest === undefined) break;
          bossHitReplies.delete(oldest);
        }
      }
      bossHitReplies.set(key, { webhook: interaction.webhook, messageId: msg.id, expiresAt: Date.now() + HIT_REPLY_TTL_MS, freshUntil: Date.now() + HIT_REPLY_EDIT_WINDOW_MS });
    }
  };
  const chained = (hitReplyLocks.get(key) ?? Promise.resolve()).then(run, run);
  hitReplyLocks.set(key, chained);
  try {
    await chained;
  } finally {
    if (hitReplyLocks.get(key) === chained) hitReplyLocks.delete(key);
  }
}

function bossReplyKey(guildId: string, eventId: number, uid: string): string {
  return `${guildId}:${eventId}:${uid}`;
}

// Generic per-user ephemeral note that edits the previous note of the same
// scope instead of stacking a new message on every click (trader, shop,
// ability, chest feedback etc.).
function ephemeralNote(interaction: ButtonInteraction, scope: string, content: string): Promise<void> {
  return sendOrEditEphemeral(interaction, `${scope}:${interaction.guildId}:${interaction.user.id}`, content);
}

// Last public boss-ability announcement per (guild, event): each new one
// replaces the previous so the channel doesn't fill up with old announcements.
const bossAbilityAnnouncements = new Map<string, { webhook: ButtonInteraction["webhook"]; messageId: string; expiresAt: number }>();
// Per-(guild,event) promise chain so concurrent boss hits can't post duplicate
// announcements before the map settles.
const bossAnnouncementLocks = new Map<string, Promise<void>>();

async function handleFinalBoss(interaction: ButtonInteraction, eventId: number) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
  const guildId = interaction.guildId!;
  const activeBossMap = getGuildActiveBossMap(guildId);
  const boss = activeBossMap.get(eventId);

  const eligibility = checkBossEligibility(boss, uid);
  if (!eligibility.ok) {
    const msg: Record<string, string> = {
      no_boss:  "⌛ Dragonul nu a fost invocat încă.",
      defeated: "💀 Dragonul Stins a fost deja înfrânt de Regat!",
      dead:     "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți lovi.",
    };
    await interaction.followUp({ content: msg[eligibility.reason] ?? "❌ Nu poți participa.", flags: MessageFlags.Ephemeral });
    return;
  }

  const activeBoss = boss!;
  const player = await upsertPlayer(uid, guildId, interaction.user.username);

  activeBoss.playerNames.set(uid, interaction.user.username);

  const clsKey = player.class && isClassKey(player.class) ? player.class : null;
  const cls = clsKey ? classStats(clsKey, player.classLevel ?? 1) : null;
  const comp = player.companion && isCompanionKey(player.companion)
    ? companionStats(player.companion, player.companionLevel ?? 1)
    : null;
  const weapon = player.equippedWeapon && isEquipmentKey(player.equippedWeapon)
    ? equipmentStats(player.equippedWeapon, equipmentLevel(player, player.equippedWeapon))
    : null;
  const armor = player.equippedArmor && isEquipmentKey(player.equippedArmor)
    ? equipmentStats(player.equippedArmor, equipmentLevel(player, player.equippedArmor))
    : null;

  const prestigeMaxHp = 100 + player.maxHpBonus + player.prestigeHpBonus + (cls?.hp ?? 0) + (comp?.hp ?? 0) + (weapon?.hp ?? 0) + (armor?.hp ?? 0);
  if (!activeBoss.playerHp.has(uid)) {
    activeBoss.playerHp.set(uid, Math.max(10, prestigeMaxHp));
  }
  if (!activeBoss.playerStats.has(uid)) {
    const stats: BossPlayerStats = {
      atk: player.attackBonus + player.prestigeAttackBonus + (cls?.attack ?? 0) + (comp?.attack ?? 0) + (weapon?.attack ?? 0) + (armor?.attack ?? 0),
      def: player.defenseBonus + player.prestigeDefenseBonus + (comp?.defense ?? 0) + (weapon?.defense ?? 0) + (armor?.defense ?? 0),
      dodge: player.dodgeBonus + player.prestigeDodgeBonus + (cls?.dodge ?? 0) + (weapon?.dodge ?? 0) + (armor?.dodge ?? 0),
      crit: player.critBonus + player.prestigeCritBonus + (cls?.crit ?? 0) + (comp?.crit ?? 0) + (weapon?.crit ?? 0) + (armor?.crit ?? 0),
      maxHp: prestigeMaxHp,
    };
    activeBoss.playerStats.set(uid, stats);
  }
  const myHp = activeBoss.playerHp.get(uid)!;
  const myMaxHp = prestigeMaxHp;

  const cooldown = checkBossHitCooldown(activeBoss.lastHitAt, uid);
  if (cooldown.onCooldown) {
    await interaction.followUp({
      content: `⏳ Recuperare… mai poți lovi în **${cooldown.remainingSeconds}s**!\n❤️ Viața ta: **${myHp} / ${myMaxHp} HP** | 🐉 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mods = getCombatModifiers(uid);
  const firstBossHit = !activeBoss.hitsBy.has(uid);
  if (firstBossHit) {
    void recordPersonalActivity(uid, guildId, "bosses").catch((err) =>
      logger.warn({ err, discordId: uid, guildId }, "Personal boss activity update failed"),
    );
  }

  const totalAtk = player.attackBonus + player.prestigeAttackBonus + (cls?.attack ?? 0) + (comp?.attack ?? 0) + (weapon?.attack ?? 0) + (armor?.attack ?? 0);
  const totalCrit = player.critBonus + player.prestigeCritBonus + (cls?.crit ?? 0) + (comp?.crit ?? 0) + (weapon?.crit ?? 0) + (armor?.crit ?? 0);
  const totalDef = player.defenseBonus + player.prestigeDefenseBonus + (comp?.defense ?? 0) + (weapon?.defense ?? 0) + (armor?.defense ?? 0);
  const minDmg = Math.max(30, totalAtk * 5 + 20);
  const maxDmg = Math.max(80, totalAtk * 15 + 60);
  const baseBossDmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
  let playerDmg = baseBossDmg;
  const isCrit = Math.random() * 100 < Math.min(100, Math.max(0, totalCrit + mods.critAdd));
  if (isCrit) playerDmg *= 2;
  const finalBossPowerLevel = clsKey ? classPowerLevel(player, clsKey, "power1") : 0;
  const usedEmpower = activeBoss.empowerNext.delete(uid) && finalBossPowerLevel >= 1;
  if (usedEmpower) playerDmg = Math.round(playerDmg * empowerMult(finalBossPowerLevel));
  if (mods.damageMult !== 1) playerDmg = Math.round(playerDmg * mods.damageMult);
  const critTag = isCrit ? " 💥 **CRITIC!**" : "";

  let bossHit = Math.round((Math.floor(Math.random() * 121) + 80) * veteranMult(activeBoss.veteranRank ?? 0));
  // Ash Shield: stays active as long as it's armed; each hit is reduced by
  // shieldReduction% and the ABSORBED damage drains the shield's OWN HP pool.
  // If the pool can't cover the absorption, the shield shatters and the hit
  // lands in full.
  let usedShield = false;
  let shieldAbsorbed = 0;
  let shieldBroke = false;
  let shieldHpLeftLine = 0;
  const myShield = activeBoss.shieldNext.get(uid);
  if (myShield && myShield.level >= 1) {
    const reduced = Math.max(1, Math.round(bossHit * (1 - shieldReduction(myShield.level))));
    const absorbed = Math.max(0, bossHit - reduced);
    if (absorbed > 0 && myShield.hp >= absorbed) {
      myShield.hp -= absorbed;
      usedShield = true;
      shieldAbsorbed = absorbed;
      shieldHpLeftLine = myShield.hp;
      bossHit = reduced;
    } else if (absorbed > 0) {
      // Shield HP can't cover the absorption: the shield shatters.
      activeBoss.shieldNext.delete(uid);
      shieldBroke = true;
    }
  }
  bossHit = Math.max(1, bossHit - totalDef);
  if (mods.damageTakenMult !== 1) bossHit = Math.max(1, Math.round(bossHit * mods.damageTakenMult));
  const newPlayerHp = Math.max(0, myHp - bossHit);

  // Mana regen: every Dragon hit counts as a normal attack (+10% max mana).
  const bossManaMax = maxMana(player.manaLevel ?? 0);
  const bossManaBefore = player.mana ?? 0;
  let playerAfterMana = await regenPlayerMana(uid, guildId, manaRegenPerAttack(player.manaLevel ?? 0, player.manaRegenLevel ?? 0), bossManaMax).catch((err) => {
    logger.error({ err, discordId: uid, guildId }, "regenPlayerMana (boss) failed");
    return null;
  }) ?? player;
  // Actual mana regained this hit (clamped by the max pool).
  const bossManaGained = Math.max(0, (playerAfterMana?.mana ?? bossManaBefore) - bossManaBefore);
  // Ash Shield strain (boss path): absorbing damage also saps mana (% of the
  // absorbed amount, floors at 0). An empty mana pool never breaks the shield.
  const bossShieldDrain = myShield && shieldAbsorbed > 0 ? shieldManaDrain(shieldAbsorbed, myShield.level) : 0;
  // Extra mana the boss's AoE special ability drains from THIS player's shield
  // (filled in the AoE loop below, shown in the mana-flow breakdown).
  let bossAoeDrainForMe = 0;
  if (bossShieldDrain > 0) {
    playerAfterMana = await drainPlayerMana(uid, guildId, bossShieldDrain).catch((err) => {
      logger.error({ err, discordId: uid, guildId }, "drainPlayerMana (boss) failed");
      return null;
    }) ?? playerAfterMana;
  }

  const dmgBreakdownLine = (() => {
    if (playerDmg === baseBossDmg) return "";
    const parts: string[] = [];
    if (isCrit) parts.push("💥 critică ×2");
    if (usedEmpower) parts.push("🌑 putere de clasă");
    return `🗡️ Daune normale: **${baseBossDmg}** → cu ${parts.length ? parts.join(" + ") : "bonusuri"}: **${playerDmg}**\n`;
  })();

  const abilityLine =
    (usedEmpower ? "🌑 **LOVITURA UMBREI!** Puterea Umbrelor ți-a dublat lovitura!\n" : "") +
    (usedShield ? `🛡️ **SCUT DE CENUȘĂ activ!** A absorbit **${shieldAbsorbed}** daune *(viața scutului: ${shieldHpLeftLine} rămasă, −${bossShieldDrain} mană)*.\n` : "") +
    (shieldBroke ? "💥 *Scutul de Cenușă s-a spart — viața lui nu a mai acoperit daunele! Lovitura te-a atins din plin.*\n" : "") +
    dmgBreakdownLine;

  activeBoss.lastHitAt.set(uid, Date.now());
  activeBoss.damageBy.set(uid, (activeBoss.damageBy.get(uid) ?? 0) + playerDmg);
  activeBoss.hitsBy.set(uid, (activeBoss.hitsBy.get(uid) ?? 0) + 1);
  activeBoss.currentHp = Math.max(0, activeBoss.currentHp - playerDmg);
  activeBoss.playerHp.set(uid, newPlayerHp);

  const bossDefeated = activeBoss.currentHp <= 0 && !activeBoss.defeated;

  // Shared ability charge bar: every hit fills it; when full the boss
  // unleashes its special ability on ALL living fighters, then it resets.
  let bossAbilityAnnouncement = "";
  if (!bossDefeated) {
    activeBoss.charge = (activeBoss.charge ?? 0) + 1;
    if (activeBoss.charge >= FINAL_BOSS_CHARGE_MAX) {
      activeBoss.charge = 0;
      const bossIdentity = BOSSES[bossIndex(activeBoss.level)]!;
      const ab = bossIdentity.ability;
      const hitLines: string[] = [];
      let totalDrained = 0;
      for (const [pid, hp] of activeBoss.playerHp) {
        if (hp <= 0) continue;
        const pMaxHp = activeBoss.playerStats.get(pid)?.maxHp ?? 100;
        let dmg = Math.max(1, Math.round((pMaxHp * ab.pct) / 100));
        // An active Ash Shield also absorbs the boss's special ability — the
        // absorbed damage drains the shield's own HP; if the pool can't cover
        // it, the shield shatters and the hit lands in full.
        let shieldTag = "";
        const pShield = activeBoss.shieldNext.get(pid);
        if (pShield) {
          const reduced = Math.max(1, Math.round(dmg * (1 - shieldReduction(pShield.level))));
          const absorbed = Math.max(0, dmg - reduced);
          if (absorbed > 0 && pShield.hp >= absorbed) {
            pShield.hp -= absorbed;
            dmg = reduced;
            // Shield strain: the absorption also saps the bearer's mana.
            const aoeDrain = shieldManaDrain(absorbed, pShield.level);
            if (aoeDrain > 0) {
              const drained = await drainPlayerMana(pid, guildId, aoeDrain).catch((err) => {
                logger.error({ err, discordId: pid, guildId }, "drainPlayerMana (boss AoE) failed");
                return null;
              });
              if (pid === uid) {
                bossAoeDrainForMe += aoeDrain;
                if (drained) playerAfterMana = drained;
              }
            }
            shieldTag = ` 🛡️ *(scut −${absorbed}, viață scut: ${pShield.hp}, −${aoeDrain} mană)*`;
          } else if (absorbed > 0) {
            activeBoss.shieldNext.delete(pid);
            shieldTag = " 💥 *(scutul s-a spart — viață insuficientă)*";
          }
        }
        const nhp = Math.max(0, hp - dmg);
        activeBoss.playerHp.set(pid, nhp);
        totalDrained += dmg;
        hitLines.push(`💥 <@${pid}> −**${dmg} HP**${shieldTag}${nhp <= 0 ? " ⚰️ **doborât!**" : ""}`);
      }
      if (ab.steal && totalDrained > 0) {
        activeBoss.currentHp = Math.min(activeBoss.maxHp, activeBoss.currentHp + totalDrained);
      }
      bossAbilityAnnouncement =
        `${ab.emoji} **${bossIdentity.name} își dezlănțuie abilitatea: ${ab.name}!**\n` +
        hitLines.join("\n") +
        (ab.steal && totalDrained > 0 ? `\n🩸 Bossul absoarbe viața luptătorilor și se vindecă cu **+${totalDrained.toLocaleString()} HP**!` : "");
    }
  }

  if (bossDefeated) {
    activeBoss.defeated = true;
    activeBossMap.delete(eventId);
    await deleteActiveBoss(eventId, activeBoss.guildId).catch(err =>
      logger.error({ err, eventId }, "Failed to delete defeated boss row — stale row may persist until next restart")
    );

    // Read the guild's kill count BEFORE incrementing so we can detect the
    // kill that crosses the veteran rank cap (same celebration as doCombat).
    const finalBossKillsBefore = await getFinalBossKills(activeBoss.guildId).catch((err) => {
      logger.error({ err, guildId: activeBoss.guildId }, "Failed to read final-boss kills before increment — cap celebration may be skipped");
      return null;
    });
    const bossRewards = computeBossRewards(activeBoss.damageBy, activeBoss.rarity, activeBoss.hitsBy, activeBoss.veteranRank ?? 0);
    const gameplayConfig = getGameplayConfig(activeBoss.guildId);
    for (const reward of bossRewards.values()) {
      reward.gold = Math.round(reward.gold * gameplayConfig.economy.bossGoldMultiplier);
      reward.xp = Math.round(reward.xp * gameplayConfig.economy.bossXpMultiplier);
    }
    const baseRewards = new Map([...bossRewards.entries()].map(([id, r]) => [id, { gold: r.gold, xp: r.xp }]));
    const prestigeLevels = await getPrestigeLevels(activeBoss.guildId, [...bossRewards.keys()]).catch(() => new Map<string, number>());
    for (const [discordId, r] of bossRewards) {
      const rmods = getRewardMultipliers(discordId, activeBoss.guildId);
      r.gold = Math.round(r.gold * rmods.goldMult * prestigeGoldMult(prestigeLevels.get(discordId) ?? 0));
      r.xp = Math.round(r.xp * rmods.xpMult);
    }
    const eventKeyDrops = rollEventKeyDrops([...activeBoss.damageBy.keys()]);
    const bossItemKey = (activeBoss.rarity === "epic" || activeBoss.rarity === "legendar")
      ? "inima_abisului"
      : "coama_dragonului";
    const bossEquipmentDrops = new Map<string, EquipmentKey>();
    for (const discordId of activeBoss.damageBy.keys()) {
      const drop = rollEquipmentDrop(activeBoss.level, "boss");
      if (drop) bossEquipmentDrops.set(discordId, drop);
    }
    await Promise.all([
      ...[...bossRewards.entries()].flatMap(([discordId, r]) => [
        addPlayerReputation(discordId, guildId, r.rep),
        addPlayerGold(discordId, guildId, r.gold),
        addPlayerXp(discordId, guildId, r.xp),
      ]),
      ...[...eventKeyDrops.entries()].map(([discordId, kt]) => addPlayerKey(discordId, guildId, kt as KeyType)),
      ...[...activeBoss.damageBy.keys()].map((discordId) => addPlayerItem(discordId, guildId, bossItemKey)),
      ...[...activeBoss.damageBy.keys()].flatMap((discordId) => [
        addPlayerItem(discordId, guildId, "fragment_arma"),
        addPlayerItem(discordId, guildId, "fragment_armura"),
      ]),
      ...[...bossEquipmentDrops.entries()].flatMap(([discordId, key]) => [
        grantEquipment(discordId, guildId, key),
      ]),
      // Veteran ranks: the guild's dragon remembers every defeat — next spawn
      // comes back stronger (+20% HP/dmg per rank, same rules as mini-bossii).
      incrementFinalBossKills(activeBoss.guildId).catch(err =>
        logger.error({ err, guildId: activeBoss.guildId }, "Failed to increment final-boss veteran kills")
      ),
    ]);
    void Promise.all(
      [...eventKeyDrops.keys()].map((discordId) =>
        recordPersonalActivity(discordId, guildId, "keys"),
      ),
    ).catch((err) => logger.warn({ err, guildId }, "Personal boss key activity update failed"));

    try {
      const fightCh = await interaction.client.channels.fetch(activeBoss.channelId).catch(() => null);
      if (fightCh instanceof TextChannel) {
        const bossMsg = await fightCh.messages.fetch(activeBoss.messageId).catch(() => null);
        await bossMsg?.delete().catch(() => null);
      }
      const bossTopId = getChannel("bossTop", guildId);
      const topCh = bossTopId ? await interaction.client.channels.fetch(bossTopId).catch(() => null) : null;
      if (topCh instanceof TextChannel && !isTicketCategoryParentId(topCh.parentId, topCh.guildId)) {
        const leaderboard = buildBossLeaderboard(activeBoss, activeBoss.damageBy, activeBoss.participants, activeBoss.playerNames, activeBoss.playerHp, activeBoss.hitsBy);
        const lootSections: string[] = [];
        if (eventKeyDrops.size > 0) {
          const lines = [...eventKeyDrops.entries()].map(
            ([id, kt]) => `${KEY_EMOJI[kt] ?? "🗝️"} <@${id}> a găsit o **${KEY_LABEL[kt] ?? "Cheie"}**!`,
          );
          lootSections.push(`🗝️ **Prada ascunsă a Dragonului:**\n${lines.join("\n")}`);
        }
        if (bossEquipmentDrops.size > 0) {
          const lines = [...bossEquipmentDrops.entries()].map(
            ([id, key]) => `✨ <@${id}> a primit **${EQUIPMENT[key].label}**!`,
          );
          lootSections.push(`⚒️ **Prada de echipament a Dragonului:**\n${lines.join("\n")}`);
        }
        await publishLeaderboardResult(interaction.client, guildId, "bossTop", {
          embeds: [leaderboard],
          content: lootSections.join("\n\n"),
        });
      }
    } catch { /* ignore */ }

    const myReward = bossRewards.get(interaction.user.id);
    const myBase = baseRewards.get(interaction.user.id);
    const goldStr = myReward && myBase && myBase.gold !== myReward.gold
      ? `**+${myReward.gold} Oboli** *(normal ${myBase.gold})*`
      : `**+${myReward?.gold ?? 0} Oboli**`;
    const xpStr = myReward && myBase && myBase.xp !== myReward.xp
      ? `**+${myReward.xp} XP** *(normal ${myBase.xp})*`
      : `**+${myReward?.xp ?? 0} XP**`;
    const rewLine = myReward
      ? `🏅 Tu primești: **+${myReward.rep} Rep**, ${goldStr}, ${xpStr}!`
      : `🏅 Recompensele au fost distribuite!`;
    const bossItemInfo = ITEMS[bossItemKey];
    const itemLine = `${bossItemInfo.emoji} Toți participanții au primit **${bossItemInfo.label}** în inventar!`;
    const equipmentLine = "⚒️ Toți participanții au primit câte un **Fragment de Armă** și un **Fragment de Armură**!";
    const myEquipmentDrop = bossEquipmentDrops.get(interaction.user.id);

    const victoryMsg = await interaction.followUp({
      content:
        abilityLine +
        `⚔️ **${interaction.user.username}** a dat lovitura finală! **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
        `💀 **Dragonul Stins a căzut!** Regatul este salvat!\n` +
        finalBossVeteranCapLine(finalBossKillsBefore) +
        rewLine + "\n" +
        itemLine + "\n" + equipmentLine +
        (myEquipmentDrop ? `\n✨ Ai primit **${EQUIPMENT[myEquipmentDrop].label}** — vezi imaginea și bonusurile mai jos.` : ""),
      embeds: myEquipmentDrop ? [buildEquipmentLootEmbed(myEquipmentDrop)] : [],
    });
    setTimeout(() => void victoryMsg.delete().catch(() => {}), BOSS_RESULT_TTL_MS);
    return;
  }

  void persistBossState(activeBoss);

  try {
    const ch = await interaction.client.channels.fetch(activeBoss.channelId);
    if (ch instanceof TextChannel) {
      const bossMsg = await ch.messages.fetch(activeBoss.messageId).catch(() => null);
      if (bossMsg) {
        await bossMsg.edit({
          embeds: [buildFinalBossEmbed(activeBoss.level, activeBoss.rarity, activeBoss.currentHp, activeBoss.maxHp, activeBoss.damageBy, activeBoss.playerNames, activeBoss.playerHp, activeBoss.playerStats, activeBoss.expiresAt, activeBoss.charge, activeBoss.veteranRank ?? 0)],
          components: [finalBossRow(eventId)],
        }).catch(() => null);
      }
    }
  } catch { /* ignore */ }

  // Public announcement when the boss ability fired (visible to everyone).
  // Each new announcement deletes the previous one, and it is also
  // auto-deleted after a couple of minutes so the channel stays clean.
  if (bossAbilityAnnouncement) {
    const annKey = `${guildId}:${eventId}`;
    const announcementText = bossAbilityAnnouncement;
    const runAnn = async () => {
      const prevAnn = bossAbilityAnnouncements.get(annKey);
      if (prevAnn && prevAnn.expiresAt > Date.now()) {
        void prevAnn.webhook.deleteMessage(prevAnn.messageId).catch(() => null);
      }
      bossAbilityAnnouncements.delete(annKey);
      const annMsg = await interaction.followUp({ content: announcementText }).catch(() => null);
      if (annMsg) {
        bossAbilityAnnouncements.set(annKey, { webhook: interaction.webhook, messageId: annMsg.id, expiresAt: Date.now() + 2 * 60 * 1000 });
        setTimeout(() => {
          void interaction.webhook.deleteMessage(annMsg.id).catch(() => null);
          if (bossAbilityAnnouncements.get(annKey)?.messageId === annMsg.id) bossAbilityAnnouncements.delete(annKey);
        }, 2 * 60 * 1000);
      }
    };
    const annChained = (bossAnnouncementLocks.get(annKey) ?? Promise.resolve()).then(runAnn, runAnn);
    bossAnnouncementLocks.set(annKey, annChained);
    try {
      await annChained;
    } finally {
      if (bossAnnouncementLocks.get(annKey) === annChained) bossAnnouncementLocks.delete(annKey);
    }
  }

  const myFinalHp = activeBoss.playerHp.get(uid) ?? newPlayerHp;
  const playerStatus = myFinalHp <= 0
    ? `💀 **Ai fost doborât de Dragon!** Nu mai poți lovi.`
    : `❤️ Viața ta: **${myFinalHp} / ${myMaxHp} HP**`;
  const hpBarLine = `${buildHpBar(myFinalHp, myMaxHp)}\n`;

  const effectsLine = formatCombatEffects(uid);
  await sendOrEditEphemeral(
    interaction,
    bossReplyKey(guildId, eventId, uid),
    abilityLine +
      `⚔️ Ai lovit Dragonul pentru **${playerDmg.toLocaleString()} daune**!${critTag}\n` +
      `🐉 Dragonul te lovește pentru **${bossHit} daune**! ${playerStatus}\n` +
      hpBarLine +
      `🔷 Mana ta: **${playerAfterMana.mana}/${bossManaMax}** ${manaBar(playerAfterMana.mana, bossManaMax)}${(() => {
        const parts: string[] = [];
        if (bossManaGained > 0) parts.push(`+${bossManaGained} regenerare`);
        if (bossShieldDrain + bossAoeDrainForMe > 0) parts.push(`−${bossShieldDrain + bossAoeDrainForMe} efortul scutului`);
        return parts.length ? ` *(${parts.join(", ")})*` : "";
      })()}\n` +
      ((): string => {
        const s = activeBoss.shieldNext.get(uid);
        if (!s) return "";
        const sMax = shieldMaxHp(Math.max(1, s.level));
        return `🛡️ Viața scutului: **${s.hp}/${sMax}** ${shieldBar(s.hp, sMax)}\n`;
      })() +
      `🩸 Dragon: **${activeBoss.currentHp.toLocaleString()} / ${activeBoss.maxHp.toLocaleString()} HP**` +
      (effectsLine ? `\n🔮 **Efectele tale active:**\n${effectsLine}` : ""),
  );
}

async function handleBossAbility(interaction: ButtonInteraction, eventId: number, kind: string) {
  await interaction.deferUpdate();
  const uid = interaction.user.id;
  const guildId = interaction.guildId!;
  const activeBossMap = getGuildActiveBossMap(guildId);
  const boss = activeBossMap.get(eventId);

  const eligibility = checkBossEligibility(boss, uid);
  if (!eligibility.ok) {
    const msg: Record<string, string> = {
      no_boss:  "⌛ Dragonul nu a fost invocat încă.",
      defeated: "💀 Dragonul Stins a fost deja înfrânt de Regat!",
      dead:     "💀 Ești căzut în luptă! Dragonul te-a doborât — nu mai poți folosi abilități.",
    };
    await interaction.followUp({ content: msg[eligibility.reason] ?? "❌ Nu poți participa.", flags: MessageFlags.Ephemeral });
    return;
  }
  const activeBoss = boss!;
  const player = await upsertPlayer(uid, guildId, interaction.user.username);
  const classKey = player.class && isClassKey(player.class) ? player.class : null;
  const slot: ClassPowerSlot = kind === "shield" ? "power2" : "power1";
  const power = classPowerFor(classKey, slot);

  const abilityLevel = classKey ? classPowerLevel(player, classKey, slot) : 0;
  const owns = abilityLevel >= 1;
  if (!owns) {
    await interaction.followUp({ content: `🔒 Nu deții **${power?.label ?? "această putere"}**. O poți debloca din Forja Cenușii → **Puteri**.`, flags: MessageFlags.Ephemeral });
    return;
  }

  const manaCost = abilityManaCost(abilityLevel);

  if (kind === "shield") {
    // Flat activation cost in mana, then the shield stays up with its OWN HP
    // pool; it shatters when the pool can't cover the absorbed damage.
    const existing = activeBoss.shieldNext.get(uid);
    if (existing) {
      const sMax = shieldMaxHp(Math.max(1, existing.level));
      await sendOrEditEphemeral(
        interaction,
        bossReplyKey(guildId, eventId, uid),
         `${power?.emoji ?? "🛡️"} **${power?.label ?? "Puterea defensivă"} e deja activă!** Rămâne ridicată cât timp viața ei acoperă daunele absorbite.\n🛡️ Viața scutului: **${existing.hp}/${sMax}** ${shieldBar(existing.hp, sMax)}`,
      );
      return;
    }
    const activationCost = SHIELD_ACTIVATION_COST;
    const afterActivation = await spendPlayerMana(uid, guildId, activationCost);
    if (!afterActivation) {
      const maxM = maxMana(player.manaLevel ?? 0);
      await sendOrEditEphemeral(
        interaction,
        bossReplyKey(guildId, eventId, uid),
         `🔷 **Mană insuficientă!** Activarea ${power?.label ?? "puterii defensive"} costă fix **${activationCost}** mană, tu ai **${player.mana ?? 0}/${maxM}** ${manaBar(player.mana ?? 0, maxM)}\n⚔️ Lovește Dragonul cu atacuri normale ca să îți refaci mana (+${manaRegenPct(player.manaRegenLevel ?? 0)}% pe atac).`,
      );
      return;
    }
    const pool = shieldMaxHp(Math.max(1, abilityLevel));
    activeBoss.shieldNext.set(uid, { hp: pool, level: abilityLevel });
    const pct = Math.round(shieldReduction(abilityLevel) * 100);
    await sendOrEditEphemeral(
      interaction,
      bossReplyKey(guildId, eventId, uid),
       `${power?.emoji ?? "🛡️"} **${power?.label ?? "Puterea defensivă"} activată!** *(−${activationCost} mană)*\n` +
        `Cât timp e ridicat, absoarbe **${pct}%** din fiecare lovitură a Dragonului, iar daunele absorbite se scad din viața scutului **și consumă mană** (**${shieldManaDrainPct(abilityLevel)}%** din daunele absorbite; mana goală NU sparge scutul). Când viața scutului se termină, scutul se sparge!\n` +
        `🛡️ Viața scutului: **${pool}/${pool}** ${shieldBar(pool, pool)}`,
    );
    void persistBossState(activeBoss);
    return;
  }

  const plMana = await spendPlayerMana(uid, guildId, manaCost);
  if (!plMana) {
    const maxM = maxMana(player.manaLevel ?? 0);
    await sendOrEditEphemeral(
      interaction,
      bossReplyKey(guildId, eventId, uid),
       `🔷 **Mană insuficientă!** ${power?.label ?? "Puterea ofensivă"} costă **${manaCost}** mană, tu ai **${player.mana ?? 0}/${maxM}** ${manaBar(player.mana ?? 0, maxM)}\n⚔️ Lovește Dragonul cu atacuri normale ca să îți refaci mana (+${manaRegenPct(player.manaRegenLevel ?? 0)}% pe atac).`,
    );
    return;
  }

  const manaLine = `\n🔷 −**${manaCost}** mană → **${plMana.mana}/${maxMana(plMana.manaLevel)}**`;
  activeBoss.empowerNext.add(uid);
  await sendOrEditEphemeral(
    interaction,
    bossReplyKey(guildId, eventId, uid),
     `${power?.emoji ?? "⚔️"} **${power?.label ?? "Puterea ofensivă"} pregătită!** Următoarea ta lovitură în Dragon va fi amplificată.` + manaLine,
  );
  void persistBossState(activeBoss);
}

async function handlePersonalChestClaim(interaction: ButtonInteraction, recipientId?: string) {
  if (!recipientId || recipientId !== interaction.user.id) {
    await interaction.reply({
      content: "🔒 Acesta este Cufărul Vegherii Zilnice al altui călător. Doar persoana indicată îl poate deschide.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  stopPersonalChestRefresh(personalChestRefreshKey(interaction.guildId!, interaction.user.id));
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const claimed = await claimPersonalChest(interaction.user.id, guildId);
  if (!claimed) {
    await ephemeralNote(interaction, "personal-chest", "🕯️ Cufărul a fost deja deschis sau nu ai încă activitate pentru astăzi.");
    return;
  }
  const reward = personalChestReward(claimed);
  await Promise.all([
    addPlayerGold(interaction.user.id, guildId, reward.gold),
    addPlayerXp(interaction.user.id, guildId, reward.xp),
    ...(reward.itemKey ? [addPlayerItem(interaction.user.id, guildId, reward.itemKey)] : []),
  ]);
  await interaction.editReply({
    embeds: [buildPersonalChestEmbed(claimed, interaction.user.username)],
    components: [personalChestRow(claimed, interaction.user.id)],
  });
  await interaction.followUp({
    content:
      `🕯️ **Cufărul Vegherii Zilnice s-a deschis!** Ai primit **${reward.gold} Oboli** și **${reward.xp} XP**.` +
      (reward.itemKey ? ` Bonus: **${ITEMS[reward.itemKey as keyof typeof ITEMS]?.label ?? reward.itemKey}**.` : ""),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleFratiaVoteButton(interaction: ButtonInteraction, option: "gold" | "xp" | "relic") {
  await interaction.deferUpdate();
  const vote = await castFratiaVote(interaction.guildId!, interaction.user.id, option);
  if (vote === "already") {
    await interaction.followUp({ content: "🤝 Glasul tău a fost deja înregistrat.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (vote === "closed" || !vote) {
    await interaction.followUp({ content: "⌛ Votul Frăției s-a închis sau nu mai este disponibil.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.message.edit({
    embeds: [buildFratiaVoteEmbed(vote)],
    components: vote.status === "open" ? fratiaVoteRows() : [],
  }).catch(() => null);
  await interaction.followUp({ content: "✅ Alegerea ta a fost înscrisă în Chivot.", flags: MessageFlags.Ephemeral });
}

async function handleSeasonalChestClaim(interaction: ButtonInteraction, chestId: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const chest = await claimSeasonalChest(guildId, chestId, interaction.user.id, interaction.user.username);
  if (!chest) {
    const staleChest = await getSeasonalChest(guildId, chestId);
    if (staleChest) {
      const expired = !staleChest.claimed && staleChest.expiresAt <= Date.now();
      await interaction.message.edit({
        embeds: [buildSeasonalChestEmbed(staleChest, staleChest.claimed, expired)],
        components: [seasonalChestRow(staleChest.id, staleChest.claimed, expired)],
      }).catch(() => null);
      scheduleSeasonalChestMessageDeletion(interaction.client, {
        ...staleChest,
        cleanupAt: staleChest.cleanupAt ?? Date.now() + 20 * 60 * 1000,
      });
    }
    await ephemeralNote(interaction, "seasonal-chest", "🌒 Cufărul sezonier a fost deja revendicat sau a expirat.");
    return;
  }
  const meta = SEASONAL_CHESTS.find((item) => item.season === chest.season) ?? SEASONAL_CHESTS[0]!;
  await Promise.all([
    addPlayerGold(interaction.user.id, guildId, meta.gold),
    addPlayerXp(interaction.user.id, guildId, meta.xp),
    addPlayerItem(interaction.user.id, guildId, "fragment_coroana"),
  ]);
  await interaction.message.edit({
    embeds: [buildSeasonalChestEmbed(chest, true)],
    components: [seasonalChestRow(chest.id, true)],
  }).catch(() => null);
  const seasonalReply = await interaction.followUp({
    content: `🎁 **${interaction.user.username}** a revendicat **${meta.label}**: **${meta.gold} Oboli**, **${meta.xp} XP** și un **Fragment de Coroană**!`,
  });
  setTimeout(() => { void seasonalReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  await deleteClaimedChestMessage(interaction.message, chest.id, "seasonal-claimed");
}

async function handleHiddenChestClaim(interaction: ButtonInteraction, chestId: string) {
  await interaction.deferUpdate();
  const guildId = interaction.guildId!;
  const chest = await claimHiddenChest(guildId, chestId, interaction.user.id, interaction.user.username);
  if (!chest) {
    await ephemeralNote(interaction, "oracle-chest", "👁️ Sigiliul a fost deja atins sau comoara a dispărut.");
    return;
  }
  await Promise.all([
    addPlayerGold(interaction.user.id, guildId, chest.rewardGold),
    addPlayerXp(interaction.user.id, guildId, chest.rewardXp),
    addPlayerItem(interaction.user.id, guildId, "fragment_ochiul_cenușii"),
  ]);
  await interaction.message.edit({
    embeds: [buildHiddenChestEmbed(chest, true)],
    components: [hiddenChestRow(chest.id, true)],
  }).catch(() => null);
  const hiddenReply = await interaction.followUp({
    content: `👁️ **${interaction.user.username}** a deschis Cufărul Șoaptelor Oracolului: **${chest.rewardGold} Oboli**, **${chest.rewardXp} XP** și un fragment de relicvă!`,
  });
  setTimeout(() => { void hiddenReply.delete().catch(() => {}); }, CLAIM_TTL_MS);
  await deleteClaimedChestMessage(interaction.message, chest.id, "hidden-claimed");
}

async function handleAuctionButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const auction = await getAuction(interaction.guildId!);
  await interaction.editReply({ embeds: [buildAuctionEmbed(auction)], components: [auctionRow()] });
}

async function handleAuctionBidButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId("auction_bid_modal")
    .setTitle("Licitează în Târgul Negru");
  const amount = new TextInputBuilder()
    .setCustomId("auction_amount")
    .setLabel("Oferta ta în Oboli")
    .setPlaceholder("Introdu o sumă mai mare decât oferta curentă")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(10);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amount));
  await interaction.showModal(modal);
}

async function handleAuctionBidModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const rawAmount = interaction.fields.getTextInputValue("auction_amount").trim();
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await interaction.editReply({ content: "❌ Introdu un număr întreg pozitiv de Oboli." });
    return;
  }

  const result = await placeAuctionBid(interaction.guildId!, interaction.user.id, amount);
  let publicMessageUpdated = true;
  if (interaction.message) {
    publicMessageUpdated = await interaction.message.edit({
      embeds: [buildAuctionEmbed(result.auction)],
      components: [auctionRow()],
    }).then(() => true).catch(() => false);
  }
  await interaction.editReply({
    content: result.message + (
      result.ok && !publicMessageUpdated
        ? "\n⚠️ Oferta a fost înregistrată, dar mesajul public nu a mai putut fi actualizat."
        : ""
    ),
    embeds: interaction.message ? [buildAuctionEmbed(result.auction)] : [],
    components: interaction.message ? [auctionRow()] : [],
  });
}

async function handleTributeContributeButton(interaction: ButtonInteraction, eventId: string) {
  // Showing the modal is the initial Discord acknowledgement, so it must happen
  // before any database work. The submit handler performs the authoritative
  // open/closed validation before accepting a contribution.
  const modal = new ModalBuilder()
    .setCustomId(`tribute_submit_${eventId}`)
    .setTitle("Ofrandă pentru Tribut");
  const amount = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Câți Oboli oferi?")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(12);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amount));
  await interaction.showModal(modal);
}

async function handleTributeModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const eventId = interaction.customId.replace("tribute_submit_", "");
  const rawAmount = interaction.fields.getTextInputValue("amount").replace(/[,_\s]/g, "");
  const amount = Number(rawAmount);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    await interaction.editReply({ content: "❌ Introdu o sumă întreagă de Oboli, mai mare decât 0." });
    return;
  }

  try {
    await ensureTributePlayer(interaction.guildId!, interaction.user.id, interaction.user.username);
    const result = await handleTributeContribution(
      interaction.client,
      interaction.guildId!,
      eventId,
      interaction.user.id,
      interaction.user.username,
      amount,
    );
    if (result.status !== "accepted") {
      const content = result.status === "insufficient"
        ? "❌ Nu ai suficienți Oboli pentru această contribuție."
        : result.status === "invalid"
          ? "❌ Suma trebuie să fie mai mică sau egală cu suma rămasă pentru tribut."
          : "🩸 Tributul s-a încheiat înainte ca oferta ta să fie procesată.";
      await interaction.editReply({ content });
      return;
    }

    if (result.completed) {
      await interaction.editReply({
        content:
          `👑 Ai completat **Tributul Regatului** cu **${amount.toLocaleString("ro-RO")} Oboli**!\n` +
          "Ai primit **Favorul Regelui**: +50% XP și +50% Oboli timp de 30 de minute.",
      });
    } else {
      const remaining = result.event.target - result.event.raised;
      await interaction.editReply({
        content:
          `🩸 Ai oferit **${amount.toLocaleString("ro-RO")} Oboli**.\n` +
          `Mai lipsesc **${remaining.toLocaleString("ro-RO")} Oboli** pentru Regat.`,
      });
    }
  } catch (err) {
    logger.error({ err, guildId: interaction.guildId, eventId }, "Tribute contribution failed");
    await interaction.editReply({ content: "❌ Ofranda nu a putut fi procesată. Încearcă din nou." });
  }
}

async function handleButton(interaction: ButtonInteraction) {
  const id = interaction.customId;

  if (id === "verification_start") {
    return handleVerificationButton(interaction, getVerificationWebsiteUrl(interaction.guildId!));
  }

  if (id.startsWith("ticket_")) {
    return handleTicketButton(interaction);
  }

  if (id.startsWith("help_")) {
    return handleHelpButton(interaction);
  }

  if (isOracleCouncilButton(id)) {
    return handleOracleCouncilVote(interaction);
  }

  if (id.startsWith("profile_view_")) {
    return handleViewProfile(interaction, id.replace("profile_view_", ""));
  }

  if (id === "trader_auction") {
    return handleAuctionButton(interaction);
  }
  if (id === "auction_bid") {
    return handleAuctionBidButton(interaction);
  }
  if (id === "auction_refresh") {
    return handleAuctionButton(interaction);
  }

  if (id.startsWith("tribute_contribute_")) {
    return handleTributeContributeButton(interaction, id.replace("tribute_contribute_", ""));
  }

  if (id === "trader_back") return handleTraderBack(interaction);
  if (id === "trader_inventory") return handleTraderInventory(interaction);
  if (id.startsWith("trader_open_")) {
    return handleTraderClaim(interaction, id.replace("trader_open_", ""));
  }
  if (id.startsWith("trader_")) {
    const m = id.match(/^trader_(\w+)$/);
    if (m) return handleTraderSelect(interaction, m[1]!);
  }

  if (id === "personal_chest_claim") return handlePersonalChestClaim(interaction);
  if (id.startsWith("personal_chest_claim_")) {
    return handlePersonalChestClaim(interaction, id.replace("personal_chest_claim_", ""));
  }
  if (id.startsWith("fratia_vote_")) {
    const option = id.replace("fratia_vote_", "");
    if (option === "gold" || option === "xp" || option === "relic") {
      return handleFratiaVoteButton(interaction, option);
    }
  }
  if (id.startsWith("seasonal_chest_")) {
    return handleSeasonalChestClaim(interaction, id.replace("seasonal_chest_", ""));
  }
  if (id.startsWith("hidden_chest_")) {
    return handleHiddenChestClaim(interaction, id.replace("hidden_chest_", ""));
  }

  if (id.startsWith("lockchest_") && !id.endsWith("_claimed") && !id.endsWith("_expired")) {
    const m = id.match(/^(lockchest_\d+)_(\w+)_(\d+)$/);
    if (m) return handleLockedChestClaim(interaction, m[1]!, m[2]!, parseInt(m[3]!));
  }

  if (id.startsWith("keychest_") && !id.endsWith("_claimed") && !id.endsWith("_expired")) {
    const m = id.match(/^keychest_\d+_(\w+)$/);
    if (m) return handleKeyChestClaim(interaction, id, m[1]!);
  }

  if (id.startsWith("mimic_") && !id.endsWith("_done")) {
    const m = id.match(/^mimic_(chest_\d+_\w+_\d+(?:_\w+)?(?:_x[23])?)_(\d+)_(\w+)_(\d+)$/);
    if (m) return handleMimicClaim(interaction, m[1]!, m[2]!, m[3]!, parseInt(m[4]!));
  }

  if (id.startsWith("chest_") && !id.endsWith("_claimed") && !id.endsWith("_expired") && !id.endsWith("_opening")) {
    const variantChoiceMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)_(\w+)(?:_x([23]))?_(gold|xp|blessing|relic)$/);
    if (variantChoiceMatch) {
      const mult = variantChoiceMatch[5] ? (parseInt(variantChoiceMatch[5]!) as 2 | 3) : 1;
      return handleChestClaim(interaction, variantChoiceMatch[1]!, variantChoiceMatch[2]!, parseInt(variantChoiceMatch[3]!), mult, variantChoiceMatch[6]!, variantChoiceMatch[4]!);
    }
    const choiceMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)(?:_x([23]))?_(gold|xp|blessing|relic)$/);
    if (choiceMatch) {
      const mult = choiceMatch[4] ? (parseInt(choiceMatch[4]!) as 2 | 3) : 1;
      return handleChestClaim(interaction, choiceMatch[1]!, choiceMatch[2]!, parseInt(choiceMatch[3]!), mult, choiceMatch[5]!);
    }
    const newMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)(?:_x([23]))?$/);
    if (newMatch) {
      const mult = newMatch[4] ? (parseInt(newMatch[4]!) as 2 | 3) : 1;
      return handleChestClaim(interaction, newMatch[1]!, newMatch[2]!, parseInt(newMatch[3]!), mult);
    }
    const variantMatch = id.match(/^(chest_\d+)_(\w+)_(\d+)_(\w+)$/);
    if (variantMatch) {
      return handleChestClaim(interaction, variantMatch[1]!, variantMatch[2]!, parseInt(variantMatch[3]!), 1, "gold", variantMatch[4]!);
    }
    const legacyMatch = id.match(/^(chest_\d+)_(\d+)$/);
    if (legacyMatch) {
      return handleChestClaim(interaction, legacyMatch[1]!, "bronz", parseInt(legacyMatch[2]!));
    }
    const simpleMatch = id.match(/^(chest_\d+)$/);
    if (simpleMatch) {
      const msgEmbed = interaction.message.embeds[0];
      const goldMatch = msgEmbed?.description?.match(/\*\*(\d+) Oboli\*\*/);
      const gold = goldMatch ? parseInt(goldMatch[1]!) : 50;
      return handleChestClaim(interaction, simpleMatch[1]!, "bronz", gold);
    }
  }

  if (id.startsWith("ora_join_")) return handleJoin(interaction, parseInt(id.replace("ora_join_", "")));
  if (id.startsWith("ora_attack_")) return handleAttack(interaction, parseInt(id.replace("ora_attack_", "")));
  if (id.startsWith("ora_ability_")) {
    const parts = id.split("_");
    return handleAbility(interaction, parseInt(parts[2]!), parts[3]!);
  }
  if (id.startsWith("ora_retreat_")) return handleRetreat(interaction, parseInt(id.replace("ora_retreat_", "")));
  if (id.startsWith("finalboss_")) return handleFinalBoss(interaction, parseInt(id.replace("finalboss_", "")));
  if (id.startsWith("bossability_")) {
    const parts = id.split("_");
    return handleBossAbility(interaction, parseInt(parts[1]!), parts[2]!);
  }
  if (id.startsWith("class_pick_")) return handleClassPick(interaction, id.replace("class_pick_", ""));

  if (id === "shop_nav_stats") return handleShopNavStats(interaction);
  if (id === "shop_nav_comp") return handleShopNavComp(interaction);
  if (id === "shop_nav_abil") return handleShopNavAbil(interaction);
  if (id === "shop_nav_prestige") return handleShopNavPrestige(interaction);
  if (id === "shop_nav_class") return handleShopNavClass(interaction);
  if (id === "shop_nav_equipment") return handleShopNavEquipment(interaction);
  if (id === "shop_nav_talisman") return handleShopNavTalisman(interaction);
  if (id.startsWith("inventory_equip_")) return handleEquipmentEquip(interaction, id.replace("inventory_equip_", ""));
  if (id.startsWith("inventory_upgrade_")) return handleEquipmentUpgrade(interaction, id.replace("inventory_upgrade_", ""));
  if (id.startsWith("inventory_equipment_")) return handleEquipmentPick(interaction, id.replace("inventory_equipment_", ""));
  if (id.startsWith("shop_equipment_upgrade_")) return handleEquipmentUpgrade(interaction, id.replace("shop_equipment_upgrade_", ""));
  if (id.startsWith("shop_equipment_equip_")) return handleEquipmentEquip(interaction, id.replace("shop_equipment_equip_", ""));
  if (id.startsWith("shop_equipment_")) return handleEquipmentPick(interaction, id.replace("shop_equipment_", ""));
  if (id.startsWith("shop_talisman_") && id !== "shop_talisman_upgrade") return handleShopTalismanPick(interaction, id.replace("shop_talisman_", ""));
  if (id === "shop_talisman_upgrade") return handleShopTalismanUpgrade(interaction);
  if (id.startsWith("shop_class_")) return handleShopClassPick(interaction, id.replace("shop_class_", ""));
  if (id === "shop_prestigebuy") return handlePrestigeBuy(interaction);
  if (id === "shop_back") return handleShopBack(interaction);

  if (id.startsWith("shop_buy_")) {
    return handleBuy(interaction, id.replace("shop_buy_", "") as ShopKey);
  }
  if (id.startsWith("shop_compbuy_")) return handleCompBuy(interaction, id.replace("shop_compbuy_", ""));
  if (id === "shop_compup") return handleCompUpgrade(interaction);
  if (id === "shop_classup") return handleClassUpgrade(interaction);
  if (id === "shop_compreset") return handleCompReset(interaction);
  if (id === "shop_classreset") return handleClassReset(interaction);
  if (id === "shop_compreset_yes") return handleCompResetConfirm(interaction);
  if (id === "shop_classreset_yes") return handleClassResetConfirm(interaction);
  if (id === "shop_reset_no") return handleResetCancel(interaction);
  if (id.startsWith("shop_powerbuy_")) return handleAbilBuy(interaction, id.replace("shop_powerbuy_", ""));
  if (id.startsWith("shop_powerup_")) return handleAbilUpgrade(interaction, id.replace("shop_powerup_", ""));
  if (id === "shop_manaup") return handleManaUpgrade(interaction);
  if (id === "shop_manaregenup") return handleManaRegenUpgrade(interaction);

  if (id.startsWith("ora_lvlup_")) {
    const parts = id.split("_");
    const bonus = parts[parts.length - 1]!;
    const eventId = parseInt(parts[2]!);
    return handleLevelup(interaction, eventId, bonus);
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({
      content: "⌛ Această acțiune nu mai este disponibilă. Deschide din nou meniul sau folosește comanda corespunzătoare.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function setupTrader(client: Client, guildId: string): Promise<void> {
  if (isTraderSetupInProgress(guildId)) {
    logger.info({ guildId }, "Trader setup already in progress — skipping duplicate call");
    return;
  }
  traderSetupInProgress.set(guildId, true);
  try {
    const traderChannelId = getChannel("trader", guildId);
    if (!traderChannelId) {
      logger.debug({ guildId }, "Trader channel is not configured — skipping trader setup");
      return;
    }
    const channel = await client.channels.fetch(traderChannelId).catch(() => null);
    if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
      logger.warn({ channelId: traderChannelId, guildId }, "Trader channel not found");
      return;
    }
    if (isTicketCategoryParentId(channel.parentId, channel.guildId)) {
      logger.warn(
        { channelId: channel.id, parentId: channel.parentId, guildId },
        "Trader channel is a ticket channel — automated post skipped",
      );
      return;
    }

    const traderEmbeds = traderMainEmbeds();
    const rows = traderMainRows();

    let msgId = getTraderMessageId(guildId);
    if (!msgId) {
      msgId = await loadTraderMessageId(guildId);
      setTraderMessageId(guildId, msgId);
    }

    const currentSig = IMG.trader ?? "";
    const storedSig = await loadTraderEmbedSig(guildId);
    const imageChanged = storedSig !== currentSig;

    if (msgId) {
      try {
        const oldMsg = await channel.messages.fetch(msgId);
        if (!imageChanged) {
          await oldMsg.edit({ embeds: traderEmbeds, components: rows });
          logger.info({ traderMessageId: msgId, guildId }, "Trader message edited on reconnect");
          return;
        }
        try {
          await oldMsg.delete();
        } catch (delErr) {
          const delCode = (delErr as { code?: number } | null)?.code;
          if (delCode !== 10008) {
            logger.warn({ delErr, traderMessageId: msgId, guildId }, "Trader delete failed (transient) — keeping message, will retry next restart");
            return;
          }
        }
        logger.info({ traderMessageId: msgId, guildId }, "Trader image changed — replacing message so the new image renders");
        setTraderMessageId(guildId, null);
        await clearTraderMessageId(guildId).catch(() => null);
        msgId = null;
      } catch (err) {
        const code = (err as { code?: number } | null)?.code;
        if (code !== 10008) {
          logger.warn({ err, traderMessageId: msgId, guildId }, "Trader edit failed (transient) — keeping message, will retry next restart");
          return;
        }
        logger.warn({ traderMessageId: msgId, guildId }, "Trader message no longer exists (10008) — re-posting once");
        setTraderMessageId(guildId, null);
        await clearTraderMessageId(guildId).catch(() => null);
        msgId = null;
      }
    }

    const msg = await channel.send({ embeds: traderEmbeds, components: rows });
    setTraderMessageId(guildId, msg.id);
    await saveTraderMessageId(guildId, msg.id);
    await saveTraderEmbedSig(guildId, currentSig);
    logger.info({ traderMessageId: msg.id, channelId: getChannel("trader", guildId), guildId }, "Trader message posted and persisted");
  } catch (err) {
    logger.error({ err, guildId }, "Failed to set up trader");
  } finally {
    traderSetupInProgress.set(guildId, false);
  }
}

async function maybeRecordOracleToxicityRelationship(message: Message) {
  try {
    const botId = botClient?.user?.id;
    if (!botId) return null;
    if (!message.guildId) return null;

    let directedAtBot = message.mentions.users.has(botId);
    if (!directedAtBot && message.reference?.messageId) {
      const referenced = await message.fetchReference().catch(() => null);
      directedAtBot = referenced?.author?.id === botId;
    }
    if (!directedAtBot) return null;

    const previous = await getPlayerById(message.author.id, message.guildId);
    const bondBefore = previous?.oracleBond ?? 0;
    const relationDelta =
      bondBefore >= ORACLE_HIGH_RELATION_THRESHOLD
        ? -30
        : ORACLE_HOSTILE_RELATION_DELTA;
    const relationship = await recordOracleRelationshipChange(message, relationDelta);
    if (!relationship) return null;
    await announceOracleRelationshipChange(message, relationDelta, relationship);
    return {
      bondBefore,
      bondAfter: relationship.oracleBond ?? bondBefore + relationDelta,
      relationDelta,
    };
  } catch (err) {
    logger.debug({ err, guildId: message.guildId }, "Oracle toxicity relationship update skipped");
    return null;
  }
}

export async function startBot(onReady?: () => void): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }

  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
  ];
  // GuildMembers, GuildPresences and MessageContent are all privileged. Keep the
  // bot online when the portal toggles are absent rather than requesting any one
  // of them unconditionally and receiving gateway 4014.
  const privilegedGatewayEnabled = process.env.DISCORD_PRIVILEGED_INTENTS_ENABLED === "true";
  const wantsMessageContent = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";
  const requestsPrivilegedIntents = (privilegedGatewayEnabled || wantsMessageContent) && !privilegedIntentFellBack;
  if (requestsPrivilegedIntents) {
    if (privilegedGatewayEnabled) {
      intents.push(GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers);
    }
    if (wantsMessageContent) intents.push(GatewayIntentBits.MessageContent);
  } else if ((privilegedGatewayEnabled || wantsMessageContent) && privilegedIntentFellBack) {
    logger.warn(
      "A privileged Discord intent was rejected (code 4014) on a prior attempt — booting WITHOUT privileged intents. " +
        "Enable the required toggles in the Discord Developer Portal, then restart the bot.",
    );
  }
  const client = new Client({ intents });

  function scheduleTicketPanel(channel: unknown): void {
    if (!channel || typeof channel !== "object") return;
    const candidate = channel as {
      guildId?: string | null;
      parentId?: string | null;
      isTextBased?: () => boolean;
    };
    if (!candidate.guildId || !candidate.parentId || !candidate.isTextBased?.()) return;
    const kind = getOracleTicketKindFromParentId(candidate.parentId, candidate.guildId);
    const botId = client.user?.id;
    if (!kind || !botId) return;

    scheduleIncompleteTicketDeletion(channel);
    void postTicketPanelIfMissing(channel as Message["channel"], kind, botId)
      .then((posted) => {
        if (posted) {
          logger.info(
            { guildId: candidate.guildId, channelId: (channel as { id?: string }).id, ticketKind: kind },
            "Interactive ticket panel posted when ticket channel opened",
          );
        }
      })
      .catch((err) => {
        logger.warn(
          { err, guildId: candidate.guildId, channelId: (channel as { id?: string }).id, ticketKind: kind },
          "Could not post interactive ticket panel when ticket channel opened",
        );
      });
  }

  client.on(Events.ChannelCreate, (channel) => {
    scheduleTicketPanel(channel);
  });
  client.on(Events.ChannelUpdate, (_oldChannel, channel) => {
    scheduleTicketPanel(channel);
  });

  // Event-loop lag monitor: if the loop is blocked, interactions pile up and
  // expire (10062). A tick scheduled every second should fire ~on time.
  {
    let lastTick = Date.now();
    setInterval(() => {
      const now = Date.now();
      const lagMs = now - lastTick - 1000;
      lastTick = now;
      if (lagMs > 500) {
        logger.warn({ lagMs }, "Event loop lag detected — something is blocking the process");
      }
    }, 1000).unref?.();
  }

  let rejectTerminated!: (err: Error) => void;
  let resolveTerminated!: () => void;
  const terminated = new Promise<void>((resolve, reject) => {
    resolveTerminated = resolve;
    rejectTerminated = reject;
  });

  // Set when a newer bot instance claims leadership in the DB and this one
  // shuts itself down — suppresses disconnect alerts caused by our own destroy().
  let yieldedLeadership = false;

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online and ready");
    botClient = client;
    setModerationClient(client);
    attachModeration(client);
    botReadyAt = new Date();
    shardStatus = "ready";

    try {
      await ensureBotStateTable();
      // Required schema must exist before any player profile or Oracle handler runs.
      await runMultiGuildMigrations();
      setOracleToxicityRelationshipHandler(maybeRecordOracleToxicityRelationship);
      setOracleTimeoutPersistence({
        save: saveOracleTimeoutLock,
        remove: deleteOracleTimeoutLock,
      });
      const oracleTimeoutLocks = await loadOracleTimeoutLocks();
      restoreOracleTimeouts(oracleTimeoutLocks);
      logger.info({ count: oracleTimeoutLocks.length }, "Restored Oracle timeout locks");
    } catch (err) {
      logger.error({ err }, "Required database migrations failed — stopping Discord bot");
      shardStatus = "migration_failed";
      botClient = null;
      setModerationClient(null);
      await client.destroy();
      rejectTerminated(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // Initialize each guild the bot is in
    const guilds = c.guilds.cache;
    logger.info({ guildCount: guilds.size }, "Bot is in guilds — initializing per-guild scheduler");

    for (const [guildId, guild] of guilds) {
      await initChannelConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load channel config for guild"),
      );
      await initTicketConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load ticket config for guild"),
      );
      await initGameplayConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load gameplay config for guild"),
      );
      const inviteTracking = await loadInviteTrackingConfig(guildId).catch((err) => {
        logger.warn({ err, guildId }, "Failed to load invite statistics settings");
        return null;
      });
      if (inviteTracking) {
        await applyInviteTrackingConfig(client, guild, inviteTracking).catch((err) =>
          logger.warn({ err, guildId }, "Failed to initialize invite statistics"),
        );
      }
      await syncNativeAutoMod(client, guildId, await getModerationConfig(guildId)).catch((err) =>
        logger.warn({ err, guildId }, "Native Discord AutoMod synchronization failed"),
      );
      if (!hasAnyChannelConfigured(guildId)) {
        void sendOnboardingMessage(guild).catch((err) =>
          logger.warn({ err, guildId }, "Failed to send onboarding message"),
        );
      }
      startGuildScheduler(client, guildId);
      void setupTrader(client, guildId);
      for (const channel of guild.channels.cache.values()) {
        scheduleTicketPanel(channel);
      }
    }

    logOracleChatStatus();
    if (onReady) onReady();

    await maybeAlertOracleRecovery(getOracleReplyMode, consumeOracleFellBackMarker, sendAlert);

    // ── Single-instance guard ─────────────────────────────────────────────────
    // Claim leadership (last writer wins), then periodically re-check the
    // marker. If a NEWER process claims it (e.g. after a redeploy while this
    // old VM is still alive), shut this bot down so two gateway sessions never
    // race to acknowledge the same interactions (40060/10062 → laggy bot).
    const instanceId = randomUUID();
    try {
      await claimBotInstance(instanceId);
      logger.info({ instanceId }, "Claimed bot instance leadership");
    } catch (err) {
      // Could not claim — skip the watchdog entirely so a stale marker from a
      // previous instance can never make THIS legitimate instance yield.
      logger.error({ err }, "Failed to claim bot instance leadership — watchdog disabled");
      return;
    }

    const watchdog = setInterval(() => {
      void getBotInstanceHolder()
        .then((holder) => {
          if (yieldedLeadership || !shouldYieldLeadership(holder, instanceId)) return;
          yieldedLeadership = true;
          clearInterval(watchdog);
          logger.error(
            { holder, instanceId },
            "Another bot instance claimed leadership — yielding: stopping schedulers and disconnecting this bot",
          );
          shardStatus = "yielded";
          botClient = null;
          setModerationClient(null);
          for (const [guildId] of client.guilds.cache) {
            stopGuildScheduler(guildId, { stopOracle: true });
            stopInviteTracking(guildId);
          }
          void sendAlert(
            "⚠️ **Instanță duplicată detectată.** O instanță mai nouă a botului a preluat controlul — instanța veche s-a oprit singură pentru a evita răspunsuri duble/lente.",
          );
          void client.destroy();
          resolveTerminated();
        })
        .catch((err) => {
          logger.warn({ err }, "Bot instance watchdog check failed — will retry");
        });
    }, INSTANCE_WATCHDOG_INTERVAL_MS);
    watchdog.unref?.();
  });

  // When the bot joins a new guild, start the scheduler for it
  client.on(Events.GuildCreate, async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot joined new guild");
    // Clear any guild-specific commands so only global commands show (prevents duplicates)
    void new REST().setToken(token!).put(
      Routes.applicationGuildCommands(APPLICATION_ID, guild.id),
      { body: [] },
    ).catch((err) => logger.warn({ err, guildId: guild.id }, "Could not clear guild commands on join"));
    await initChannelConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init channel config for new guild"),
    );
    await initTicketConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init ticket config for new guild"),
    );
    await initGameplayConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init gameplay config for new guild"),
    );
    const inviteTracking = await loadInviteTrackingConfig(guild.id).catch((err) => {
      logger.warn({ err, guildId: guild.id }, "Failed to load invite statistics settings for new guild");
      return null;
    });
    if (inviteTracking) {
      await applyInviteTrackingConfig(client, guild, inviteTracking).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Failed to initialize invite statistics for new guild"),
      );
    }
    await syncNativeAutoMod(client, guild.id, await getModerationConfig(guild.id)).catch((err) =>
      logger.warn({ err, guildId: guild.id }, "Native Discord AutoMod synchronization failed"),
    );
    if (!hasAnyChannelConfigured(guild.id)) {
      void sendOnboardingMessage(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Failed to send onboarding message"),
      );
    }
    startGuildScheduler(client, guild.id);
    void setupTrader(client, guild.id);
  });

  // When the bot leaves a guild, clean up in-memory state
  client.on(Events.GuildDelete, (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot left guild — cleaning up scheduler state");
    stopGuildScheduler(guild.id, { stopOracle: true });
    stopInviteTracking(guild.id);
    traderMessageIds.delete(guild.id);
    traderSetupInProgress.delete(guild.id);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.guildId) return;
    const channelName = "name" in message.channel && typeof message.channel.name === "string"
      ? message.channel.name
      : message.channelId;
    void recordDailyMessage(message.guildId, message.author.id, message.channelId, channelName).catch((err) =>
      logger.warn({ err, guildId: message.guildId, channelId: message.channelId }, "Daily message statistics update failed"),
    );
    try {
      recordMessage(
        message.author.id,
        message.member?.displayName ?? message.author.username,
        message.content ?? "",
        message.guildId,
        message.channelId,
        message.id,
        message.reference?.messageId,
      );
      refreshOraclePresence(client, message.guildId);
    } catch (err) {
      logger.error({ err }, "Oracle messageCreate handler failed");
    }
    // Only messages in the configured main channel count toward the activity
    // gate and milestone trigger — prevents unrelated channels from keeping
    // chest spawns alive or triggering bonus chests.
    const mainChannelId = getChannel("main", message.guildId);
    if (mainChannelId && message.channelId === mainChannelId) {
      recordGuildActivity(client, message.guildId);
    }
    void recordPersonalActivity(message.author.id, message.guildId, "messages").catch((err) =>
      logger.warn({ err, discordId: message.author.id, guildId: message.guildId }, "Personal message activity update failed"),
    );
    void maybeHandleOracleClue(client, message).catch((err) =>
      logger.warn({ err, guildId: message.guildId }, "Oracle clue handler failed"),
    );
    maybeNudgeGameHelp(message);
    void handleModerationMessage(client, message).then((moderationHandled) => {
      // When AutoMod actually performed an action, do not also invoke the
      // Oracle's legacy toxicity timeout for this same message.
      if (moderationHandled) return;
      return handleToxicity(client, message);
    }).then((handled) => {
      if (handled) {
        return;
      }
      void maybeReplyAsOracle(client, message);
    }).catch((err) => {
      // Moderation storage/config failure must not turn into a second Oracle
      // sanction. The next message will retry after the operator resolves it.
      logger.error({ err, guildId: message.guildId, messageId: message.id }, "Moderation message handler failed");
    });
  });

  client.on(Events.GuildMemberAdd, (member) => {
    void recordDailyJoin(member.guild.id).catch((err) =>
      logger.warn({ err, guildId: member.guild.id }, "Daily join statistics update failed"),
    );
    queueInviteJoin(member.guild, member);
    void sendAiMemberMessage(member, "welcome").catch((err) =>
      logger.warn({ err, guildId: member.guild.id, userId: member.id }, "AI welcome message could not be sent"),
    );
  });

  client.on(Events.InviteCreate, (invite) => {
    void recordCreatedInvite(invite).catch((err) =>
      logger.warn({ err, guildId: invite.guild?.id, inviteCode: invite.code }, "New Discord invite could not be recorded"),
    );
  });

  client.on(Events.InviteDelete, (invite) => {
    void recordDeletedInvite(invite).catch((err) =>
      logger.warn({ err, guildId: invite.guild?.id, inviteCode: invite.code }, "Deleted Discord invite could not be recorded"),
    );
  });

  client.on(Events.GuildMemberRemove, (member) => {
    void recordDailyLeave(member.guild.id).catch((err) =>
      logger.warn({ err, guildId: member.guild.id }, "Daily leave statistics update failed"),
    );
    void sendAiMemberMessage(member, "leave").catch((err) =>
      logger.warn({ err, guildId: member.guild.id, userId: member.id }, "AI departure message could not be sent"),
    );
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return;
    const guild = newState.guild;
    const connectedMembers = guild.channels.cache.reduce((total, channel) => (
      channel.isVoiceBased() ? total + channel.members.size : total
    ), 0);
    void recordDailyVoicePeak(guild.id, connectedMembers).catch((err) =>
      logger.warn({ err, guildId: guild.id }, "Daily voice statistics update failed"),
    );
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
      void recordDailyBoost(newMember.guild.id).catch((err) =>
        logger.warn({ err, guildId: newMember.guild.id }, "Daily boost statistics update failed"),
      );
    }
    void enforceOracleTimeout(oldMember, newMember);
  });

  function scheduleDisconnectAlert(closeCode: number) {
    if (disconnectAlertTimer) return;
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    disconnectAlertTimer = setTimeout(() => {
      disconnectAlertTimer = null;
      void sendAlert(
        `⚠️ **Bot has been offline for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** and has not reconnected yet.\nShard disconnected with code ${closeCode}. Check server logs for details.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  function clearDisconnectAlert(reason: string) {
    if (disconnectAlertTimer) {
      clearTimeout(disconnectAlertTimer);
      disconnectAlertTimer = null;
      disconnectStartedAt = null;
      logger.info({ reason }, "Disconnect alert suppressed — bot reconnected within threshold");
    } else if (disconnectStartedAt) {
      const startedAt = disconnectStartedAt;
      disconnectStartedAt = null;
      logger.info({ reason }, "Sending recovery alert — bot back online after outage");
      void sendRecoveryAlert(startedAt);
    }
  }

  client.on(Events.ShardDisconnect, (event, shardId) => {
    // Deliberate self-shutdown after losing instance leadership — not an outage.
    if (yieldedLeadership) return;
    if (event.code === 4014 && wantsMessageContent) {
      logger.error(
        { shardId },
        "Discord rejected the MessageContent intent (code 4014) — it is not enabled in the Developer Portal. " +
          "Restarting WITHOUT it; the Oracle will only answer @mentions and ping-on replies until the toggle is enabled.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      botClient = null;
      setModerationClient(null);
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
      rejectTerminated(new Error("Disallowed MessageContent intent (4014) — falling back without it"));
      return;
    }
    if (FATAL_CLOSE_CODES.has(event.code)) {
      logger.error(
        { code: event.code, shardId },
        "Fatal Discord disconnect — discord.js will not reconnect; bot supervisor will restart",
      );
      botClient = null;
      setModerationClient(null);
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        `🚨 **Bot offline — fatal disconnect (code ${event.code}).**\nDiscord will not auto-reconnect. The bot supervisor is restarting. If it remains offline, check logs and verify \`DISCORD_TOKEN\`.`,
      );
      rejectTerminated(new Error(`Fatal Discord Gateway close code ${event.code}`));
    } else {
      logger.warn(
        { code: event.code, shardId },
        "Discord shard disconnected — discord.js will reconnect automatically",
      );
      shardStatus = "disconnected";
      if (!disconnectStartedAt) disconnectStartedAt = new Date();
      scheduleDisconnectAlert(event.code);
    }
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting…");
    shardStatus = "reconnecting";
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    clearDisconnectAlert("ShardResume");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId, replayedEvents }, "Discord shard resumed");
  });

  client.on(Events.ShardReady, (shardId) => {
    clearDisconnectAlert("ShardReady");
    shardStatus = "ready";
    botReadyAt = new Date();
    // Re-setup trader for all known guilds on reconnect
    for (const [guildId] of client.guilds.cache) {
      void setupTrader(client, guildId);
    }
    logger.info({ shardId }, "Discord shard ready (fresh identify)");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (seenInteractionIds.has(interaction.id)) {
      logger.warn({ interactionId: interaction.id }, "Duplicate interaction delivery — skipping");
      return;
    }
    seenInteractionIds.add(interaction.id);
    setTimeout(() => seenInteractionIds.delete(interaction.id), INTERACTION_DEDUP_TTL_MS).unref?.();

    // Ignore DM interactions — all commands require a guild context
    if (!interaction.guildId) return;

    const label = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : "customId" in interaction
        ? String(interaction.customId)
        : interaction.type.toString();

    // Diagnose latency: how old was this interaction when it reached us?
    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > 1500) {
      logger.warn(
        { ageMs, label, wsPing: client.ws.ping },
        "Interaction arrived late — gateway/event-loop lag (>3s causes 10062)",
      );
    }

    function dispatch(p: Promise<unknown>) {
      const startedAt = Date.now();
      p.then(
        () => {
          const durationMs = Date.now() - startedAt;
          if (durationMs > 2500) {
            logger.warn({ durationMs, label }, "Slow interaction handler");
          }
        },
        (err) => {
          logger.error({ err, label, ageMs, durationMs: Date.now() - startedAt }, "Interaction error");
          if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
            void interaction.reply({
              content: "❌ Acțiunea nu a putut fi procesată. Încearcă din nou.",
              flags: MessageFlags.Ephemeral,
            }).catch((replyErr) => {
              logger.warn({ err: replyErr, label, ageMs }, "Interaction fallback reply failed");
            });
          }
        },
      );
    }

    if (interaction.guildId && isGuildGameStopped(interaction.guildId)) {
      let allowedWhileStopped = false;
      if (interaction.isChatInputCommand()) {
        allowedWhileStopped = [
          "stopjoc",
          "startjoc",
          "stopai",
          "startai",
          "ajutor",
           "profetie",
          "setcanal",
          "setaliantatext",
          "moderare",
          "warn",
          "mute",
          "unmute",
          "kick",
          "ban",
          "purge",
          "slowmode",
          "lock",
          "unlock",
          "nick",
          "role",
        ].includes(interaction.commandName);
      } else if (interaction.isButton()) {
        allowedWhileStopped =
          interaction.customId.startsWith("ticket_") ||
          interaction.customId.startsWith("help_") ||
          interaction.customId.startsWith("council_") ||
          interaction.customId.startsWith("verification_");
      } else if (interaction.isStringSelectMenu()) {
        allowedWhileStopped = interaction.customId.startsWith("ticket_questions_");
      } else if (interaction.isModalSubmit()) {
        allowedWhileStopped =
          interaction.customId.startsWith("ticket_") ||
          interaction.customId.startsWith("help_question_");
      }

      if (!allowedWhileStopped) {
        if (interaction.isRepliable()) {
          dispatch(
            interaction.reply({
              ...messageWithImage(
                getGameplayConfig(interaction.guildId ?? "").messages.gamePaused,
                getGameplayConfig(interaction.guildId ?? "").messages.gamePausedImageUrl,
                getGameplayConfig(interaction.guildId ?? "").messages.gamePausedThumbnailUrl,
              ),
              flags: MessageFlags.Ephemeral,
            }),
          );
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      if (await handleModerationCommand(interaction as ChatInputCommandInteraction)) return;
      if (interaction.commandName === "profil") dispatch(handleProfil(interaction));
      if (interaction.commandName === "inventar") dispatch(handleInventar(interaction));
      if (interaction.commandName === "profetie") dispatch(handleProfetie(interaction));
      if (interaction.commandName === "clasament") dispatch(handleClasament(interaction));
      if (interaction.commandName === "magazin") dispatch(handleMagazin(interaction));
      if (interaction.commandName === "clasa") dispatch(handleClasa(interaction));
      if (interaction.commandName === "companion") dispatch(handleCompanion(interaction));
      if (interaction.commandName === "ajutor") dispatch(handleAjutor(interaction));
      if (interaction.commandName === "misiuni") dispatch(handleMisiune(interaction));
      if (interaction.commandName === "cufarpersonal") dispatch(handlePersonalChest(interaction));
      if (interaction.commandName === "fratie") dispatch(handleFratia(interaction));
      if (interaction.commandName === "licitatie") dispatch(handleLicitatie(interaction));
      if (interaction.commandName === "posteazalicitatie") dispatch(handlePosteazaLicitatie(interaction));
      if (interaction.commandName === "schimbrelicve") dispatch(handleSchimbRelicve(interaction));
      if (interaction.commandName === "purificacheie") dispatch(handlePurificaCheie(interaction));
      if (interaction.commandName === "chei") dispatch(handleChei(interaction));
      if (interaction.commandName === "setcanal") dispatch(handleSetCanal(interaction));
      if (interaction.commandName === "setaliantatext") dispatch(handleSetAliantaText(interaction));
      if (interaction.commandName === "stopjoc") dispatch(handleStopGame(interaction));
      if (interaction.commandName === "startjoc") dispatch(handleStartGame(interaction));
      if (interaction.commandName === "stopai") dispatch(handleStopAI(interaction));
      if (interaction.commandName === "startai") dispatch(handleStartAI(interaction));
    } else if (interaction.isButton()) {
      dispatch(handleButton(interaction as ButtonInteraction));
    } else if (interaction.isStringSelectMenu()) {
      let handled = false;
      if (interaction.customId === "leaderboard_profile_select") {
        handled = true;
        dispatch(handleClasamentSelect(interaction));
      }
      if (interaction.customId.startsWith("ticket_questions_")) {
        handled = true;
        dispatch(handleTicketQuestionSelect(interaction as StringSelectMenuInteraction));
      }
      if (!handled) {
        dispatch(interaction.reply({
          content: "⌛ Acest meniu nu mai este disponibil. Deschide-l din nou.",
          flags: MessageFlags.Ephemeral,
        }));
      }
    } else if (interaction.isModalSubmit()) {
      let handled = false;
      if (interaction.customId.startsWith("ticket_answer_")) {
        handled = true;
        dispatch(handleTicketQuestionModal(interaction));
      }
      if (interaction.customId.startsWith("ticket_form_")) {
        handled = true;
        dispatch(handleTicketModal(interaction));
      }
      if (interaction.customId.startsWith("help_question_")) {
        handled = true;
        dispatch(handleHelpQuestion(interaction));
      }
      if (interaction.customId.startsWith("tribute_submit_")) {
        handled = true;
        dispatch(handleTributeModal(interaction));
      }
      if (interaction.customId === "auction_bid_modal") {
        handled = true;
        dispatch(handleAuctionBidModal(interaction));
      }
      if (interaction.customId === "alliance_recruitment_text_modal") {
        handled = true;
        dispatch(handleSetAliantaTextModal(interaction));
      }
      if (!handled) {
        dispatch(interaction.reply({
          content: "⌛ Acest formular nu mai este disponibil. Deschide-l din nou.",
          flags: MessageFlags.Ephemeral,
        }));
      }
    }

  });

  try {
    await client.login(token);
  } catch (err) {
    if (requestsPrivilegedIntents && isDisallowedIntentError(err)) {
      logger.error(
        { err },
        "Login rejected for privileged Discord intents — restarting WITHOUT all privileged intents. " +
          "Enable the required Discord Developer Portal toggles.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
    }
    throw err;
  }

  // Register commands globally so they appear on every server
  const rest = new REST().setToken(token);
  const body = [...slashCommands.map((c) => c.toJSON()), ...moderationCommands];
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body });
  logger.info("Commands registered globally");

  // Remove any leftover guild-specific commands (can cause duplicates in Discord)
  const clearGuildCommands = async (guildId: string) => {
    try {
      await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, guildId), { body: [] });
    } catch (err) {
      logger.warn({ err, guildId }, "Could not clear guild commands (non-fatal)");
    }
  };
  await Promise.all([...client.guilds.cache.keys()].map(clearGuildCommands));
  logger.info({ count: client.guilds.cache.size }, "Cleared guild-specific commands for all guilds");

  await terminated;
}
/*
export async function startBot(onReady?: () => void): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — bot will not start");
    return;
  }

  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
  // GuildMembers, GuildPresences and MessageContent are all privileged. Keep the
  // bot online when the portal toggles are absent rather than requesting any one
  // of them unconditionally and receiving gateway 4014.
  const privilegedGatewayEnabled = process.env.DISCORD_PRIVILEGED_INTENTS_ENABLED === "true";
  const wantsMessageContent = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";
  const requestsPrivilegedIntents = (privilegedGatewayEnabled || wantsMessageContent) && !privilegedIntentFellBack;
  if (requestsPrivilegedIntents) {
    if (privilegedGatewayEnabled) {
      intents.push(GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers);
    }
    if (wantsMessageContent) intents.push(GatewayIntentBits.MessageContent);
  } else if ((privilegedGatewayEnabled || wantsMessageContent) && privilegedIntentFellBack) {
    logger.warn(
      "A privileged Discord intent was rejected (code 4014) on a prior attempt — booting WITHOUT privileged intents. " +
        "Enable the required toggles in the Discord Developer Portal, then restart the bot.",
    );
  }
  const client = new Client({ intents });

  function scheduleTicketPanel(channel: unknown): void {
    if (!channel || typeof channel !== "object") return;
    const candidate = channel as {
      guildId?: string | null;
      parentId?: string | null;
      isTextBased?: () => boolean;
    };
    if (!candidate.guildId || !candidate.parentId || !candidate.isTextBased?.()) return;
    const kind = getOracleTicketKindFromParentId(candidate.parentId);
    const botId = client.user?.id;
    if (!kind || !botId) return;

    scheduleIncompleteTicketDeletion(channel);
    void postTicketPanelIfMissing(channel as Message["channel"], kind, botId)
      .then((posted) => {
        if (posted) {
          logger.info(
            { guildId: candidate.guildId, channelId: (channel as { id?: string }).id, ticketKind: kind },
            "Interactive ticket panel posted when ticket channel opened",
          );
        }
      })
      .catch((err) => {
        logger.warn(
          { err, guildId: candidate.guildId, channelId: (channel as { id?: string }).id, ticketKind: kind },
          "Could not post interactive ticket panel when ticket channel opened",
        );
      });
  }

  client.on(Events.ChannelCreate, (channel) => {
    scheduleTicketPanel(channel);
  });
  client.on(Events.ChannelUpdate, (_oldChannel, channel) => {
    scheduleTicketPanel(channel);
  });

  // Event-loop lag monitor: if the loop is blocked, interactions pile up and
  // expire (10062). A tick scheduled every second should fire ~on time.
  {
    let lastTick = Date.now();
    setInterval(() => {
      const now = Date.now();
      const lagMs = now - lastTick - 1000;
      lastTick = now;
      if (lagMs > 500) {
        logger.warn({ lagMs }, "Event loop lag detected — something is blocking the process");
      }
    }, 1000).unref?.();
  }

  let rejectTerminated!: (err: Error) => void;
  let resolveTerminated!: () => void;
  const terminated = new Promise<void>((resolve, reject) => {
    resolveTerminated = resolve;
    rejectTerminated = reject;
  });

  // Set when a newer bot instance claims leadership in the DB and this one
  // shuts itself down — suppresses disconnect alerts caused by our own destroy().
  let yieldedLeadership = false;

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online and ready");
    botClient = client;
    setModerationClient(client);
    attachModeration(client);
    botReadyAt = new Date();
    shardStatus = "ready";

    try {
      await ensureBotStateTable();
      // Required schema must exist before any player profile or Oracle handler runs.
      await runMultiGuildMigrations();
      setOracleToxicityRelationshipHandler(maybeRecordOracleToxicityRelationship);
      setOracleTimeoutPersistence({
        save: saveOracleTimeoutLock,
        remove: deleteOracleTimeoutLock,
      });
      const oracleTimeoutLocks = await loadOracleTimeoutLocks();
      restoreOracleTimeouts(oracleTimeoutLocks);
      logger.info({ count: oracleTimeoutLocks.length }, "Restored Oracle timeout locks");
    } catch (err) {
      logger.error({ err }, "Required database migrations failed — stopping Discord bot");
      shardStatus = "migration_failed";
      botClient = null;
      setModerationClient(null);
      await client.destroy();
      rejectTerminated(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // Initialize each guild the bot is in
    const guilds = c.guilds.cache;
    logger.info({ guildCount: guilds.size }, "Bot is in guilds — initializing per-guild scheduler");

    for (const [guildId, guild] of guilds) {
      await initChannelConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load channel config for guild"),
      );
      await initGameplayConfig(guildId).catch((err) =>
        logger.error({ err, guildId }, "Failed to load gameplay config for guild"),
      );
      await syncNativeAutoMod(client, guildId, await getModerationConfig(guildId)).catch((err) =>
        logger.warn({ err, guildId }, "Native Discord AutoMod synchronization failed"),
      );
      if (!hasAnyChannelConfigured(guildId)) {
        void sendOnboardingMessage(guild).catch((err) =>
          logger.warn({ err, guildId }, "Failed to send onboarding message"),
        );
      }
      startGuildScheduler(client, guildId);
      void setupTrader(client, guildId);
      for (const channel of guild.channels.cache.values()) {
        scheduleTicketPanel(channel);
      }
    }

    logOracleChatStatus();
    if (onReady) onReady();

    await maybeAlertOracleRecovery(getOracleReplyMode, consumeOracleFellBackMarker, sendAlert);

    // ── Single-instance guard ─────────────────────────────────────────────────
    // Claim leadership (last writer wins), then periodically re-check the
    // marker. If a NEWER process claims it (e.g. after a redeploy while this
    // old VM is still alive), shut this bot down so two gateway sessions never
    // race to acknowledge the same interactions (40060/10062 → laggy bot).
    const instanceId = randomUUID();
    try {
      await claimBotInstance(instanceId);
      logger.info({ instanceId }, "Claimed bot instance leadership");
    } catch (err) {
      // Could not claim — skip the watchdog entirely so a stale marker from a
      // previous instance can never make THIS legitimate instance yield.
      logger.error({ err }, "Failed to claim bot instance leadership — watchdog disabled");
      return;
    }

    const watchdog = setInterval(() => {
      void getBotInstanceHolder()
        .then((holder) => {
          if (yieldedLeadership || !shouldYieldLeadership(holder, instanceId)) return;
          yieldedLeadership = true;
          clearInterval(watchdog);
          logger.error(
            { holder, instanceId },
            "Another bot instance claimed leadership — yielding: stopping schedulers and disconnecting this bot",
          );
          shardStatus = "yielded";
          botClient = null;
          setModerationClient(null);
          for (const [guildId] of client.guilds.cache) {
            stopGuildScheduler(guildId, { stopOracle: true });
          }
          void sendAlert(
            "⚠️ **Instanță duplicată detectată.** O instanță mai nouă a botului a preluat controlul — instanța veche s-a oprit singură pentru a evita răspunsuri duble/lente.",
          );
          void client.destroy();
          resolveTerminated();
        })
        .catch((err) => {
          logger.warn({ err }, "Bot instance watchdog check failed — will retry");
        });
    }, INSTANCE_WATCHDOG_INTERVAL_MS);
    watchdog.unref?.();
  });

  // When the bot joins a new guild, start the scheduler for it
  client.on(Events.GuildCreate, async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot joined new guild");
    // Clear any guild-specific commands so only global commands show (prevents duplicates)
    void new REST().setToken(token!).put(
      Routes.applicationGuildCommands(APPLICATION_ID, guild.id),
      { body: [] },
    ).catch((err) => logger.warn({ err, guildId: guild.id }, "Could not clear guild commands on join"));
    await initChannelConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init channel config for new guild"),
    );
    await initGameplayConfig(guild.id).catch((err) =>
      logger.error({ err, guildId: guild.id }, "Failed to init gameplay config for new guild"),
    );
    await syncNativeAutoMod(client, guild.id, await getModerationConfig(guild.id)).catch((err) =>
      logger.warn({ err, guildId: guild.id }, "Native Discord AutoMod synchronization failed"),
    );
    if (!hasAnyChannelConfigured(guild.id)) {
      void sendOnboardingMessage(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Failed to send onboarding message"),
      );
    }
    startGuildScheduler(client, guild.id);
    void setupTrader(client, guild.id);
  });

  // When the bot leaves a guild, clean up in-memory state
  client.on(Events.GuildDelete, (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Bot left guild — cleaning up scheduler state");
    stopGuildScheduler(guild.id, { stopOracle: true });
    traderMessageIds.delete(guild.id);
    traderSetupInProgress.delete(guild.id);
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.guildId) return;
    try {
      recordMessage(
        message.author.id,
        message.member?.displayName ?? message.author.username,
        message.content ?? "",
        message.guildId,
        message.channelId,
        message.id,
        message.reference?.messageId,
      );
      refreshOraclePresence(client, message.guildId);
    } catch (err) {
      logger.error({ err }, "Oracle messageCreate handler failed");
    }
    // Only messages in the configured main channel count toward the activity
    // gate and milestone trigger — prevents unrelated channels from keeping
    // chest spawns alive or triggering bonus chests.
    const mainChannelId = getChannel("main", message.guildId);
    if (mainChannelId && message.channelId === mainChannelId) {
      recordGuildActivity(client, message.guildId);
    }
    void recordPersonalActivity(message.author.id, message.guildId, "messages").catch((err) =>
      logger.warn({ err, discordId: message.author.id, guildId: message.guildId }, "Personal message activity update failed"),
    );
    void maybeHandleOracleClue(client, message).catch((err) =>
      logger.warn({ err, guildId: message.guildId }, "Oracle clue handler failed"),
    );
    maybeNudgeGameHelp(message);
    void handleModerationMessage(client, message).then((moderationHandled) => {
      // When AutoMod actually performed an action, do not also invoke the
      // Oracle's legacy toxicity timeout for this same message.
      if (moderationHandled) return;
      return handleToxicity(client, message);
    }).then((handled) => {
      if (handled) {
        return;
      }
      void maybeReplyAsOracle(client, message);
    }).catch((err) => {
      // Moderation storage/config failure must not turn into a second Oracle
      // sanction. The next message will retry after the operator resolves it.
      logger.error({ err, guildId: message.guildId, messageId: message.id }, "Moderation message handler failed");
    });
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    void enforceOracleTimeout(oldMember, newMember);
  });

  function scheduleDisconnectAlert(closeCode: number) {
    if (disconnectAlertTimer) return;
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    disconnectAlertTimer = setTimeout(() => {
      disconnectAlertTimer = null;
      void sendAlert(
        `⚠️ **Bot has been offline for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** and has not reconnected yet.\nShard disconnected with code ${closeCode}. Check server logs for details.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  function clearDisconnectAlert(reason: string) {
    if (disconnectAlertTimer) {
      clearTimeout(disconnectAlertTimer);
      disconnectAlertTimer = null;
      disconnectStartedAt = null;
      logger.info({ reason }, "Disconnect alert suppressed — bot reconnected within threshold");
    } else if (disconnectStartedAt) {
      const startedAt = disconnectStartedAt;
      disconnectStartedAt = null;
      logger.info({ reason }, "Sending recovery alert — bot back online after outage");
      void sendRecoveryAlert(startedAt);
    }
  }

  client.on(Events.ShardDisconnect, (event, shardId) => {
    // Deliberate self-shutdown after losing instance leadership — not an outage.
    if (yieldedLeadership) return;
    if (event.code === 4014 && wantsMessageContent) {
      logger.error(
        { shardId },
        "Discord rejected the MessageContent intent (code 4014) — it is not enabled in the Developer Portal. " +
          "Restarting WITHOUT it; the Oracle will only answer @mentions and ping-on replies until the toggle is enabled.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      botClient = null;
      setModerationClient(null);
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
      rejectTerminated(new Error("Disallowed MessageContent intent (4014) — falling back without it"));
      return;
    }
    if (FATAL_CLOSE_CODES.has(event.code)) {
      logger.error(
        { code: event.code, shardId },
        "Fatal Discord disconnect — discord.js will not reconnect; bot supervisor will restart",
      );
      botClient = null;
      setModerationClient(null);
      shardStatus = "fatal_disconnect";
      client.destroy();
      void sendAlert(
        `🚨 **Bot offline — fatal disconnect (code ${event.code}).**\nDiscord will not auto-reconnect. The bot supervisor is restarting. If it remains offline, check logs and verify \`DISCORD_TOKEN\`.`,
      );
      rejectTerminated(new Error(`Fatal Discord Gateway close code ${event.code}`));
    } else {
      logger.warn(
        { code: event.code, shardId },
        "Discord shard disconnected — discord.js will reconnect automatically",
      );
      shardStatus = "disconnected";
      if (!disconnectStartedAt) disconnectStartedAt = new Date();
      scheduleDisconnectAlert(event.code);
    }
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    logger.info({ shardId }, "Discord shard reconnecting…");
    shardStatus = "reconnecting";
  });

  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    clearDisconnectAlert("ShardResume");
    shardStatus = "ready";
    botReadyAt = new Date();
    logger.info({ shardId, replayedEvents }, "Discord shard resumed");
  });

  client.on(Events.ShardReady, (shardId) => {
    clearDisconnectAlert("ShardReady");
    shardStatus = "ready";
    botReadyAt = new Date();
    // Re-setup trader for all known guilds on reconnect
    for (const [guildId] of client.guilds.cache) {
      void setupTrader(client, guildId);
    }
    logger.info({ shardId }, "Discord shard ready (fresh identify)");
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (seenInteractionIds.has(interaction.id)) {
      logger.warn({ interactionId: interaction.id }, "Duplicate interaction delivery — skipping");
      return;
    }
    seenInteractionIds.add(interaction.id);
    setTimeout(() => seenInteractionIds.delete(interaction.id), INTERACTION_DEDUP_TTL_MS).unref?.();

    // Ignore DM interactions — all commands require a guild context
    if (!interaction.guildId) return;

    const label = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : "customId" in interaction
        ? String(interaction.customId)
        : interaction.type.toString();

    // Diagnose latency: how old was this interaction when it reached us?
    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > 1500) {
      logger.warn(
        { ageMs, label, wsPing: client.ws.ping },
        "Interaction arrived late — gateway/event-loop lag (>3s causes 10062)",
      );
    }

    function dispatch(p: Promise<unknown>) {
      const startedAt = Date.now();
      p.then(
        () => {
          const durationMs = Date.now() - startedAt;
          if (durationMs > 2500) {
            logger.warn({ durationMs, label }, "Slow interaction handler");
          }
        },
        (err) => {
          logger.error({ err, label, ageMs, durationMs: Date.now() - startedAt }, "Interaction error");
          if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
            void interaction.reply({
              content: "❌ Acțiunea nu a putut fi procesată. Încearcă din nou.",
              flags: MessageFlags.Ephemeral,
            }).catch((replyErr) => {
              logger.warn({ err: replyErr, label, ageMs }, "Interaction fallback reply failed");
            });
          }
        },
      );
    }

    if (interaction.guildId && isGuildGameStopped(interaction.guildId)) {
      let allowedWhileStopped = false;
      if (interaction.isChatInputCommand()) {
        allowedWhileStopped = [
          "stopjoc",
          "startjoc",
          "stopai",
          "startai",
          "ajutor",
           "profetie",
          "setcanal",
          "setaliantatext",
          "moderare",
          "warn",
          "mute",
          "unmute",
          "kick",
          "ban",
          "purge",
          "slowmode",
          "lock",
          "unlock",
          "nick",
          "role",
        ].includes(interaction.commandName);
      } else if (interaction.isButton()) {
        allowedWhileStopped =
          interaction.customId.startsWith("ticket_") ||
          interaction.customId.startsWith("help_") ||
          interaction.customId.startsWith("council_") ||
          interaction.customId.startsWith("verification_");
      } else if (interaction.isStringSelectMenu()) {
        allowedWhileStopped = interaction.customId.startsWith("ticket_questions_");
      } else if (interaction.isModalSubmit()) {
        allowedWhileStopped =
          interaction.customId.startsWith("ticket_") ||
          interaction.customId.startsWith("help_question_");
      }

      if (!allowedWhileStopped) {
        if (interaction.isRepliable()) {
          dispatch(
            interaction.reply({
              ...messageWithImage(
                getGameplayConfig(interaction.guildId ?? "").messages.gamePaused,
                getGameplayConfig(interaction.guildId ?? "").messages.gamePausedImageUrl,
                getGameplayConfig(interaction.guildId ?? "").messages.gamePausedThumbnailUrl,
              ),
              flags: MessageFlags.Ephemeral,
            }),
          );
        }
        return;
      }
    }

    if (interaction.isChatInputCommand()) {
      if (await handleModerationCommand(interaction as ChatInputCommandInteraction)) return;
      if (interaction.commandName === "profil") dispatch(handleProfil(interaction));
      if (interaction.commandName === "inventar") dispatch(handleInventar(interaction));
      if (interaction.commandName === "profetie") dispatch(handleProfetie(interaction));
      if (interaction.commandName === "clasament") dispatch(handleClasament(interaction));
      if (interaction.commandName === "magazin") dispatch(handleMagazin(interaction));
      if (interaction.commandName === "clasa") dispatch(handleClasa(interaction));
      if (interaction.commandName === "companion") dispatch(handleCompanion(interaction));
      if (interaction.commandName === "ajutor") dispatch(handleAjutor(interaction));
      if (interaction.commandName === "misiuni") dispatch(handleMisiune(interaction));
      if (interaction.commandName === "cufarpersonal") dispatch(handlePersonalChest(interaction));
      if (interaction.commandName === "fratie") dispatch(handleFratia(interaction));
      if (interaction.commandName === "licitatie") dispatch(handleLicitatie(interaction));
      if (interaction.commandName === "posteazalicitatie") dispatch(handlePosteazaLicitatie(interaction));
      if (interaction.commandName === "schimbrelicve") dispatch(handleSchimbRelicve(interaction));
      if (interaction.commandName === "purificacheie") dispatch(handlePurificaCheie(interaction));
      if (interaction.commandName === "chei") dispatch(handleChei(interaction));
      if (interaction.commandName === "setcanal") dispatch(handleSetCanal(interaction));
      if (interaction.commandName === "setaliantatext") dispatch(handleSetAliantaText(interaction));
      if (interaction.commandName === "stopjoc") dispatch(handleStopGame(interaction));
      if (interaction.commandName === "startjoc") dispatch(handleStartGame(interaction));
      if (interaction.commandName === "stopai") dispatch(handleStopAI(interaction));
      if (interaction.commandName === "startai") dispatch(handleStartAI(interaction));
    } else if (interaction.isButton()) {
      dispatch(handleButton(interaction as ButtonInteraction));
    } else if (interaction.isStringSelectMenu()) {
      let handled = false;
      if (interaction.customId === "leaderboard_profile_select") {
        handled = true;
        dispatch(handleClasamentSelect(interaction));
      }
      if (interaction.customId.startsWith("ticket_questions_")) {
        handled = true;
        dispatch(handleTicketQuestionSelect(interaction as StringSelectMenuInteraction));
      }
      if (!handled) {
        dispatch(interaction.reply({
          content: "⌛ Acest meniu nu mai este disponibil. Deschide-l din nou.",
          flags: MessageFlags.Ephemeral,
        }));
      }
    } else if (interaction.isModalSubmit()) {
      let handled = false;
      if (interaction.customId.startsWith("ticket_answer_")) {
        handled = true;
        dispatch(handleTicketQuestionModal(interaction));
      }
      if (interaction.customId.startsWith("ticket_form_")) {
        handled = true;
        dispatch(handleTicketModal(interaction));
      }
      if (interaction.customId.startsWith("help_question_")) {
        handled = true;
        dispatch(handleHelpQuestion(interaction));
      }
      if (interaction.customId.startsWith("tribute_submit_")) {
        handled = true;
        dispatch(handleTributeModal(interaction));
      }
      if (interaction.customId === "auction_bid_modal") {
        handled = true;
        dispatch(handleAuctionBidModal(interaction));
      }
      if (interaction.customId === "alliance_recruitment_text_modal") {
        handled = true;
        dispatch(handleSetAliantaTextModal(interaction));
      }
      if (!handled) {
        dispatch(interaction.reply({
          content: "⌛ Acest formular nu mai este disponibil. Deschide-l din nou.",
          flags: MessageFlags.Ephemeral,
        }));
      }
    }

  });

  try {
    await client.login(token);
  } catch (err) {
    if (requestsPrivilegedIntents && isDisallowedIntentError(err)) {
      logger.error(
        { err },
        "Login rejected for privileged Discord intents — restarting WITHOUT all privileged intents. " +
          "Enable the required Discord Developer Portal toggles.",
      );
      privilegedIntentFellBack = true;
      void markOracleFellBack();
      void sendAlert(
        "⚠️ **Oracolul nu a putut activa intenția \u201eMessage Content\u201d.**\nIntenția privilegiată nu este activată în Discord Developer Portal. " +
          "Botul repornește fără ea — răspunde doar la @mention și la reply-uri cu ping. Activează comutatorul în portal, apoi repornește botul.",
      );
    }
    throw err;
  }

  // Register commands globally so they appear on every server
  const rest = new REST().setToken(token);
  const body = [...slashCommands.map((c) => c.toJSON()), ...moderationCommands];
  await rest.put(Routes.applicationCommands(APPLICATION_ID), { body });
  logger.info("Commands registered globally");

  // Remove any leftover guild-specific commands (can cause duplicates in Discord)
  const clearGuildCommands = async (guildId: string) => {
    try {
      await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, guildId), { body: [] });
    } catch (err) {
      logger.warn({ err, guildId }, "Could not clear guild commands (non-fatal)");
    }
  };
  await Promise.all([...client.guilds.cache.keys()].map(clearGuildCommands));
  logger.info({ count: client.guilds.cache.size }, "Cleared guild-specific commands for all guilds");

  await terminated;
}
*/
