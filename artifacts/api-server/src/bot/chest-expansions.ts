import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Message,
  TextChannel,
} from "discord.js";
import { pool } from "@workspace/db";
import {
  addPlayerGold,
  addPlayerItem,
  addPlayerKey,
  addPlayerXp,
  consumePlayerItems,
  ensureBotStateTable,
  getGuildPlayers,
  getPlayerItems,
  tryDeductPlayerGold,
  type KeyType,
} from "./db";
import { BRAND_FOOTER, ITEMS } from "./survival";
import { getChannel } from "./channel-config";
import { isTicketCategoryParentId } from "./ticket-categories";

const WORLD_PREFIX = "chest_world:";
const SEASONAL_ACTIVE_SUFFIX = "seasonal_active";

function worldAsset(file: string): string | null {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
    .split(",")[0]?.trim();
  return domain ? `https://${domain}/api/assets/${file}` : null;
}

const CHEST_WORLD_IMG = {
  personal: worldAsset("chest_veghea_zilnica.png"),
  fratie: worldAsset("chivot_fratia.png"),
  corruptedKey: worldAsset("key_pangarita.png"),
  eclipse: worldAsset("chest_eclipsa_neagra.png"),
  queen: worldAsset("chest_regina_moarta.png"),
  solstice: worldAsset("chest_solstitiul_sangeros.png"),
  carnival: worldAsset("chest_carnavalul_funebru.png"),
  auction: worldAsset("trader_targul_negru.png"),
  oracle: worldAsset("chest_soaptele_oracolului.png"),
} as const;

function stateKey(guildId: string, suffix: string): string {
  return `${guildId}:${WORLD_PREFIX}${suffix}`;
}

async function loadState<T>(key: string): Promise<T | null> {
  await ensureBotStateTable();
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM bot_state WHERE key = $1",
    [key],
  );
  if (!result.rows[0]) return null;
  try {
    return JSON.parse(result.rows[0].value) as T;
  } catch {
    return null;
  }
}

async function saveState(key: string, value: unknown): Promise<void> {
  await ensureBotStateTable();
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export type PersonalActivityKind = "messages" | "kills" | "bosses" | "quests" | "keys";

export interface PersonalActivity {
  date: string;
  messages: number;
  kills: number;
  bosses: number;
  quests: number;
  keys: number;
  claimed: boolean;
}

function emptyActivity(date = today()): PersonalActivity {
  return { date, messages: 0, kills: 0, bosses: 0, quests: 0, keys: 0, claimed: false };
}

export async function recordPersonalActivity(
  discordId: string,
  guildId: string,
  kind: PersonalActivityKind,
  amount = 1,
): Promise<void> {
  const key = stateKey(guildId, `personal:${discordId}`);
  const safeAmount = Math.max(1, Math.floor(amount));
  await ensureBotStateTable();
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at)
     VALUES ($1, jsonb_build_object(
       'date', $2::text, 'messages', CASE WHEN $3 = 'messages' THEN $4 ELSE 0 END,
       'kills', CASE WHEN $3 = 'kills' THEN $4 ELSE 0 END,
       'bosses', CASE WHEN $3 = 'bosses' THEN $4 ELSE 0 END,
       'quests', CASE WHEN $3 = 'quests' THEN $4 ELSE 0 END,
       'keys', CASE WHEN $3 = 'keys' THEN $4 ELSE 0 END,
       'claimed', false
     )::text, now())
     ON CONFLICT (key) DO UPDATE SET
       value = CASE
         WHEN bot_state.value::jsonb->>'date' <> $2 THEN jsonb_build_object(
           'date', $2::text, 'messages', CASE WHEN $3 = 'messages' THEN $4 ELSE 0 END,
           'kills', CASE WHEN $3 = 'kills' THEN $4 ELSE 0 END,
           'bosses', CASE WHEN $3 = 'bosses' THEN $4 ELSE 0 END,
           'quests', CASE WHEN $3 = 'quests' THEN $4 ELSE 0 END,
           'keys', CASE WHEN $3 = 'keys' THEN $4 ELSE 0 END,
           'claimed', false
         )::text
         ELSE jsonb_set(
           bot_state.value::jsonb,
           ARRAY[$3::text],
           to_jsonb(COALESCE((bot_state.value::jsonb->>$3)::int, 0) + $4),
           true
         )::text
       END,
       updated_at = now()`,
    [key, today(), kind, safeAmount],
  );
}

export async function getPersonalActivity(
  discordId: string,
  guildId: string,
): Promise<PersonalActivity> {
  const stored = await loadState<PersonalActivity>(stateKey(guildId, `personal:${discordId}`));
  if (!stored || stored.date !== today()) return emptyActivity();
  return { ...emptyActivity(stored.date), ...stored };
}

export function personalChestScore(activity: PersonalActivity): number {
  return Math.min(
    24,
    Math.floor(activity.messages / 5) +
      Math.floor(activity.kills / 2) +
      activity.bosses * 4 +
      activity.quests * 2 +
      activity.keys,
  );
}

export function personalChestTier(activity: PersonalActivity): number {
  const score = personalChestScore(activity);
  if (score >= 18) return 5;
  if (score >= 13) return 4;
  if (score >= 9) return 3;
  if (score >= 5) return 2;
  return 1;
}

export function personalChestReward(activity: PersonalActivity): {
  tier: number;
  gold: number;
  xp: number;
  itemKey?: string;
} {
  const tier = personalChestTier(activity);
  return {
    tier,
    gold: 80 + tier * 90,
    xp: 40 + tier * 65,
    itemKey: tier >= 4 ? "fragment_luna_stinsa" : undefined,
  };
}

export async function claimPersonalChest(
  discordId: string,
  guildId: string,
): Promise<PersonalActivity | null> {
  const key = stateKey(guildId, `personal:${discordId}`);
  await ensureBotStateTable();
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
     SET value = jsonb_set(value::jsonb, '{claimed}', 'true'::jsonb, true)::text,
         updated_at = now()
     WHERE key = $1
       AND value::jsonb->>'date' = $2
       AND COALESCE((value::jsonb->>'claimed')::boolean, false) = false
       AND (
         COALESCE((value::jsonb->>'messages')::int, 0) +
         COALESCE((value::jsonb->>'kills')::int, 0) +
         COALESCE((value::jsonb->>'bosses')::int, 0) +
         COALESCE((value::jsonb->>'quests')::int, 0) +
         COALESCE((value::jsonb->>'keys')::int, 0)
       ) > 0
     RETURNING value`,
    [key, today()],
  );
  if (!result.rows[0]) return null;
  return JSON.parse(result.rows[0].value) as PersonalActivity;
}

export function buildPersonalChestEmbed(activity: PersonalActivity, recipientName?: string): EmbedBuilder {
  const reward = personalChestReward(activity);
  const score = personalChestScore(activity);
  const nextReset = new Date();
  nextReset.setUTCHours(24, 0, 0, 0);
  return new EmbedBuilder()
    .setColor(0x3d2c2c)
    .setTitle("🕯️ Cufărul Vegherii Zilnice")
    .setDescription(
      (recipientName
        ? `Acesta este cufărul personal al lui **${recipientName}**. Doar el îl poate deschide.\n\n`
        : "Un cufăr personal se ridică din cenușă pentru faptele tale de astăzi.\n\n") +
        `**Puterea vegherii:** ${score}/18 · rang **${reward.tier}/5**\n` +
        `💬 Mesaje: **${activity.messages}**\n` +
        `⚔️ Monștri răpuși: **${activity.kills}**\n` +
        `🐉 Participări la boss: **${activity.bosses}**\n` +
        `📜 Misiuni completate: **${activity.quests}**\n` +
        `🗝️ Chei obținute: **${activity.keys}**\n\n` +
        `🎁 Pradă estimată: **${reward.gold} Oboli** și **${reward.xp} XP**` +
        (reward.itemKey ? `\n💎 Bonus de rang: **${ITEMS[reward.itemKey as keyof typeof ITEMS]?.label ?? "fragment de relicvă"}**` : "") +
        `\n\n*O singură deschidere pe zi. Activitatea se resetează <t:${Math.floor(nextReset.getTime() / 1000)}:R>.*`,
    )
    .setImage(CHEST_WORLD_IMG.personal)
    .setFooter({ text: BRAND_FOOTER });
}

export function personalChestRow(
  activity: PersonalActivity,
  recipientId?: string,
): ActionRowBuilder<ButtonBuilder> {
  const available = !activity.claimed && personalChestScore(activity) > 0;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(recipientId ? `personal_chest_claim_${recipientId}` : "personal_chest_claim")
      .setLabel(activity.claimed ? "Cufăr deschis astăzi" : "Deschide cufărul personal")
      .setEmoji(activity.claimed ? "✅" : "🕯️")
      .setStyle(available ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!available),
  );
}

export interface FratiaVote {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  openedAt: number;
  closesAt: number;
  status: "open" | "closed";
  votes: Record<string, "gold" | "xp" | "relic">;
  winner?: "gold" | "xp" | "relic";
  rewardedAt?: number;
  rewardSummary?: string;
  rewardMessageId?: string;
  rewardChannelId?: string;
  cleanupAt?: number;
}

export const FRATIA_MESSAGE_RETENTION_MS = 20 * 60 * 1000;

export const FRATIA_OPTIONS = [
  { id: "gold", label: "Aur pentru toți", emoji: "🪙" },
  { id: "xp", label: "Experiență pentru toți", emoji: "✨" },
  { id: "relic", label: "Fragmente pentru primii", emoji: "💎" },
] as const;

export async function loadFratiaVote(guildId: string): Promise<FratiaVote | null> {
  return loadState<FratiaVote>(stateKey(guildId, "fratia_vote"));
}

export async function saveFratiaVote(vote: FratiaVote): Promise<void> {
  await saveState(stateKey(vote.guildId, "fratia_vote"), vote);
}

export async function castFratiaVote(
  guildId: string,
  userId: string,
  option: FratiaVote["votes"][string],
): Promise<FratiaVote | "already" | "closed" | null> {
  const key = stateKey(guildId, "fratia_vote");
  await ensureBotStateTable();
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
     SET value = jsonb_set(
       value::jsonb, '{votes}',
       COALESCE(value::jsonb->'votes', '{}'::jsonb) || jsonb_build_object($2, $3),
       true
     )::text, updated_at = now()
     WHERE key = $1 AND value::jsonb->>'status' = 'open'
       AND (value::jsonb->>'closesAt')::bigint > $4
       AND NOT (COALESCE(value::jsonb->'votes', '{}'::jsonb) ? $2)
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(
           '[{"id":"gold"},{"id":"xp"},{"id":"relic"}]'::jsonb
         ) option WHERE option->>'id' = $3
       )
     RETURNING value`,
    [key, userId, option, Date.now()],
  );
  if (result.rows[0]) return JSON.parse(result.rows[0].value) as FratiaVote;
  const current = await loadFratiaVote(guildId);
  if (!current || current.status !== "open" || current.closesAt <= Date.now()) return "closed";
  return current.votes[userId] ? "already" : null;
}

export async function closeFratiaVote(guildId: string): Promise<FratiaVote | null> {
  const key = stateKey(guildId, "fratia_vote");
  await ensureBotStateTable();
  const current = await loadFratiaVote(guildId);
  if (!current || current.status !== "open") return null;
  const counts = FRATIA_OPTIONS.map((option) => ({
    option,
    count: Object.values(current.votes).filter((vote) => vote === option.id).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  const winner = counts[0]?.option.id ?? "gold";
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
     SET value = jsonb_set(
       jsonb_set(value::jsonb, '{status}', '"closed"'::jsonb, true),
       '{winner}', to_jsonb($2::text), true
     )::text, updated_at = now()
     WHERE key = $1 AND value::jsonb->>'status' = 'open'
     RETURNING value`,
    [key, winner],
  );
  return result.rows[0] ? JSON.parse(result.rows[0].value) as FratiaVote : null;
}

export function buildFratiaVoteEmbed(vote: FratiaVote): EmbedBuilder {
  const counts = Object.fromEntries(
    FRATIA_OPTIONS.map((option) => [
      option.id,
      Object.values(vote.votes).filter((value) => value === option.id).length,
    ]),
  );
  const status = vote.status === "open"
    ? `Se închide <t:${Math.floor(vote.closesAt / 1000)}:R>.`
    : `Vot încheiat. Alegerea Frăției: **${FRATIA_OPTIONS.find((o) => o.id === vote.winner)?.label ?? "Aur pentru toți"}**.`;
  return new EmbedBuilder()
    .setColor(0x4b2635)
    .setTitle("🤝 Chivotul Legământului Cenușii")
    .setDescription(
      "Pașii serverului au umplut chivotul. Acum Frăția hotărăște ce binecuvântare se împarte.\n\n" +
        FRATIA_OPTIONS.map((option) => `${option.emoji} **${option.label}** — ${counts[option.id] ?? 0} voturi`).join("\n") +
         `\n\n⏱️ Apărut <t:${Math.floor(vote.openedAt / 1000)}:R> · ${status}`,
    )
    .setImage(CHEST_WORLD_IMG.fratie)
    .setFooter({ text: "Un singur glas de călător • " + BRAND_FOOTER });
}

export function fratiaVoteRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...FRATIA_OPTIONS.map((option) =>
        new ButtonBuilder()
          .setCustomId(`fratia_vote_${option.id}`)
          .setLabel(option.label)
          .setEmoji(option.emoji)
          .setStyle(option.id === "gold" ? ButtonStyle.Success : option.id === "xp" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ),
    ),
  ];
}

export async function rewardFratiaVote(vote: FratiaVote): Promise<{ recipientCount: number; summary: string }> {
  await ensureBotStateTable();
  const key = stateKey(vote.guildId, "fratia_vote");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stateResult = await client.query<{ value: string }>(
      "SELECT value FROM bot_state WHERE key = $1 FOR UPDATE",
      [key],
    );
    if (!stateResult.rows[0]) throw new Error(`Missing Frăția vote state for guild ${vote.guildId}`);
    const current = JSON.parse(stateResult.rows[0].value) as FratiaVote;
    if (current.rewardedAt) {
      await client.query("COMMIT");
      Object.assign(vote, current);
      return describeFratiaReward(current);
    }

    let recipientCount = 0;
    let summary: string;
    if (current.winner === "xp") {
      const updated = await client.query(
        "UPDATE players SET xp = xp + 150 WHERE guild_id = $1 RETURNING discord_id",
        [current.guildId],
      );
      recipientCount = updated.rowCount ?? 0;
      summary = `✨ **150 XP** pentru fiecare dintre cei **${recipientCount}** jucători înregistrați.`;
    } else if (current.winner === "relic") {
      const firstVoters = Object.keys(current.votes).slice(0, 3);
      for (const discordId of firstVoters) {
        await client.query(
          `INSERT INTO player_items (discord_id, guild_id, item_key, quantity)
           VALUES ($1, $2, 'fragment_ochiul_cenușii', 2)
           ON CONFLICT (discord_id, guild_id, item_key)
           DO UPDATE SET quantity = player_items.quantity + 2`,
          [discordId, current.guildId],
        );
      }
      recipientCount = firstVoters.length;
      summary = `💎 **2 Fragmente ale Ochiului Cenușii** pentru primii **${recipientCount}** votanți.`;
    } else {
      const updated = await client.query(
        "UPDATE players SET gold = gold + 120 WHERE guild_id = $1 RETURNING discord_id",
        [current.guildId],
      );
      recipientCount = updated.rowCount ?? 0;
      summary = `🪙 **120 Oboli** pentru fiecare dintre cei **${recipientCount}** jucători înregistrați.`;
    }

    current.rewardedAt = Date.now();
    current.rewardSummary = summary;
    current.cleanupAt = Date.now() + FRATIA_MESSAGE_RETENTION_MS;
    await client.query(
      "UPDATE bot_state SET value = $2, updated_at = now() WHERE key = $1",
      [key, JSON.stringify(current)],
    );
    await client.query("COMMIT");
    Object.assign(vote, current);
    return { recipientCount, summary };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}

async function describeFratiaReward(vote: FratiaVote): Promise<{ recipientCount: number; summary: string }> {
  if (vote.rewardSummary) {
    const firstNumber = Number.parseInt(vote.rewardSummary.match(/\*\*(\d+)\*\* jucători/)?.[1] ?? "", 10);
    const relicCount = vote.winner === "relic" ? Math.min(3, Object.keys(vote.votes).length) : Number.NaN;
    return {
      recipientCount: Number.isFinite(relicCount)
        ? relicCount
        : Number.isFinite(firstNumber)
          ? firstNumber
          : (await getGuildPlayers(vote.guildId)).length,
      summary: vote.rewardSummary,
    };
  }
  const players = await getGuildPlayers(vote.guildId);
  if (vote.winner === "xp") {
    return {
      recipientCount: players.length,
      summary: `✨ **150 XP** pentru fiecare dintre cei **${players.length}** jucători înregistrați.`,
    };
  }
  if (vote.winner === "relic") {
    const recipientCount = Math.min(3, Object.keys(vote.votes).length);
    return {
      recipientCount,
      summary: `💎 **2 Fragmente ale Ochiului Cenușii** pentru primii **${recipientCount}** votanți.`,
    };
  }
  return {
    recipientCount: players.length,
    summary: `🪙 **120 Oboli** pentru fiecare dintre cei **${players.length}** jucători înregistrați.`,
  };
}

export async function openFratiaVote(client: Client, guildId: string): Promise<FratiaVote | null> {
  const existing = await loadFratiaVote(guildId);
  if (existing?.status === "open" && existing.closesAt > Date.now()) return existing;

  const channelId = getChannel("fratia", guildId) ?? getChannel("main", guildId);
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (!(channel instanceof TextChannel) || isTicketCategoryParentId(channel.parentId, channel.guildId)) return null;

  const vote: FratiaVote = {
    id: `fratia_${Date.now()}`,
    guildId,
    channelId: channel.id,
    messageId: "",
    openedAt: Date.now(),
    closesAt: Date.now() + 15 * 60 * 1000,
    status: "open",
    votes: {},
  };
  const message = await channel.send({
    content: "🤝 **Chivotul Frăției s-a umplut.** Regatul decide ce binecuvântare se împarte!",
    embeds: [buildFratiaVoteEmbed(vote)],
    components: fratiaVoteRows(),
  });
  vote.messageId = message.id;
  await saveFratiaVote(vote);
  scheduleFratiaVoteClose(client, vote);
  return vote;
}

export async function rehydrateFratiaVote(client: Client, guildId: string): Promise<void> {
  const vote = await loadFratiaVote(guildId);
  if (!vote) return;
  if (vote.status === "closed") {
    if (!vote.rewardedAt || !vote.rewardMessageId) {
      await closeAndRewardFratiaVote(client, guildId);
    } else if (vote.cleanupAt) {
      scheduleFratiaMessageDeletion(client, vote);
    }
    return;
  }
  if (vote.closesAt <= Date.now()) {
    await closeAndRewardFratiaVote(client, guildId);
    return;
  }
  scheduleFratiaVoteClose(client, vote);
}

export async function closeAndRewardFratiaVote(client: Client, guildId: string): Promise<FratiaVote | null> {
  let closed = await closeFratiaVote(guildId);
  if (!closed) {
    const existing = await loadFratiaVote(guildId);
    if (!existing || existing.status !== "closed") return existing;
    closed = existing;
  }
  let reward: { recipientCount: number; summary: string };
  if (!closed.rewardedAt) {
    reward = await rewardFratiaVote(closed);
  } else {
    reward = await describeFratiaReward(closed);
  }
  const originalChannel = await client.channels.fetch(closed.channelId).catch(() => null);
  if (originalChannel instanceof TextChannel && !isTicketCategoryParentId(originalChannel.parentId, originalChannel.guildId)) {
    const message = await originalChannel.messages.fetch(closed.messageId).catch(() => null);
    await message?.edit({
      embeds: [buildFratiaVoteEmbed(closed)],
      components: [],
    }).catch(() => null);
  }
  if (!closed.rewardMessageId) {
    const configuredRewardChannelId = getChannel("fratia", guildId) ?? getChannel("main", guildId);
    const configuredChannel = configuredRewardChannelId
      ? await client.channels.fetch(configuredRewardChannelId).catch(() => null)
      : null;
    const validConfiguredChannel =
      configuredChannel instanceof TextChannel && !isTicketCategoryParentId(configuredChannel.parentId, configuredChannel.guildId)
        ? configuredChannel
        : null;
    const validOriginalChannel =
      originalChannel instanceof TextChannel && !isTicketCategoryParentId(originalChannel.parentId, originalChannel.guildId)
        ? originalChannel
        : null;
    const rewardChannel = validConfiguredChannel ?? validOriginalChannel;
    if (!rewardChannel) {
      throw new Error(`No valid channel available to publish Frăția vote for guild ${guildId}`);
    }
    const rewardMessage = await rewardChannel.send({
      content: reward.recipientCount > 0
        ? `🤝 **Binecuvântarea Frăției a fost împărțită.**\n${reward.summary}`
        : "⚠️ **Votul Frăției s-a încheiat, dar nu există beneficiari eligibili înregistrați în acest server.**",
      allowedMentions: { parse: [] },
    });
    closed.rewardMessageId = rewardMessage.id;
    closed.rewardChannelId = rewardChannel.id;
    await saveFratiaVote(closed);
  }
  scheduleFratiaMessageDeletion(client, closed);
  return closed;
}

async function deleteFratiaMessage(client: Client, vote: FratiaVote): Promise<void> {
  const originalChannel = await client.channels.fetch(vote.channelId).catch(() => null);
  const rewardChannel = vote.rewardChannelId && vote.rewardChannelId !== vote.channelId
    ? await client.channels.fetch(vote.rewardChannelId).catch(() => null)
    : originalChannel;
  await Promise.all(
    [
      { channel: originalChannel, messageId: vote.messageId },
      { channel: rewardChannel, messageId: vote.rewardMessageId },
    ].map(async ({ channel, messageId }) => {
      if (!(channel instanceof TextChannel) || !messageId) return;
      const message = await channel.messages.fetch(messageId).catch(() => null);
      await message?.delete().catch(() => null);
    }),
  );
}

function scheduleFratiaMessageDeletion(client: Client, vote: FratiaVote): void {
  const cleanupAt = vote.cleanupAt ?? Date.now() + FRATIA_MESSAGE_RETENTION_MS;
  const timer = setTimeout(() => {
    void deleteFratiaMessage(client, vote).catch(() => null);
  }, Math.max(0, cleanupAt - Date.now()));
  timer.unref?.();
}

function scheduleFratiaVoteClose(client: Client, vote: FratiaVote): void {
  const timer = setTimeout(() => {
    void closeAndRewardFratiaVote(client, vote.guildId).catch((err) => {
      console.error("Failed to close Frăția vote", err);
    });
  }, Math.max(0, vote.closesAt - Date.now()));
  timer.unref?.();
}

export interface SeasonalChest {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  season: "eclipse" | "queen" | "solstice" | "carnival";
  openedAt: number;
  expiresAt: number;
  claimed: boolean;
  claimedBy?: {
    userId: string;
    username: string;
  };
  cleanupAt?: number;
}

export const SEASONAL_CHESTS = [
  { season: "eclipse", label: "Cufărul Eclipsei Negre", emoji: "🌑", image: CHEST_WORLD_IMG.eclipse, gold: 900, xp: 400 },
  { season: "queen", label: "Sicriul Reginei Moarte", emoji: "👑", image: CHEST_WORLD_IMG.queen, gold: 1200, xp: 550 },
  { season: "solstice", label: "Chivotul Solstițiului Sângeros", emoji: "🩸", image: CHEST_WORLD_IMG.solstice, gold: 1500, xp: 700 },
  { season: "carnival", label: "Cufărul Carnavalului Funebru", emoji: "🎭", image: CHEST_WORLD_IMG.carnival, gold: 1800, xp: 850 },
] as const;

export type SeasonalSeason = typeof SEASONAL_CHESTS[number]["season"];
export const SEASONAL_CHEST_INTERVAL_MS = 60 * 60 * 1000;
/** Minimum time between seasonal chest spawns, even after the previous chest is claimed. */
export const SEASONAL_CHEST_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const SEASONAL_CHEST_MESSAGE_RETENTION_MS = 20 * 60 * 1000;

export function seasonalForBucket(bucket = Math.floor(Date.now() / SEASONAL_CHEST_INTERVAL_MS)) {
  return SEASONAL_CHESTS[bucket % SEASONAL_CHESTS.length]!;
}

export function isSeasonalChestOnCooldown(
  chest: Pick<SeasonalChest, "openedAt">,
  now = Date.now(),
): boolean {
  return Number.isFinite(chest.openedAt) && now - chest.openedAt < SEASONAL_CHEST_COOLDOWN_MS;
}

export function buildSeasonalChestEmbed(
  chest: SeasonalChest,
  claimed = false,
  expired = false,
): EmbedBuilder {
  const meta = SEASONAL_CHESTS.find((item) => item.season === chest.season) ?? SEASONAL_CHESTS[0]!;
  return new EmbedBuilder()
    .setColor(0x6b1f2f)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(
      "O rămășiță de sărbătoare blestemată a trecut prin Regat și a lăsat o comoară în urmă.\n\n" +
        `💰 **${meta.gold} Oboli** · ✨ **${meta.xp} XP** · 💎 un fragment de relicvă\n` +
         (claimed
           ? `\n✅ Comoara a fost revendicată${chest.claimedBy?.username ? ` de **${chest.claimedBy.username.replace(/[<>]/g, "").slice(0, 80)}**` : ""}.`
            : expired
              ? "\n⌛ Cufărul sezonier a expirat și nu mai poate fi revendicat."
           : `\n⚡ Cufărul rămâne disponibil până la <t:${Math.floor(chest.expiresAt / 1000)}:R>.`),
    )
    .setImage(meta.image)
    .setFooter({
      text: claimed || expired
        ? "Sezon încheiat • " + BRAND_FOOTER
        : "Eveniment sezonier • timer live în Discord",
    });
}

export function seasonalChestRow(chestId: string, claimed = false, expired = false): ActionRowBuilder<ButtonBuilder> {
  const unavailable = claimed || expired;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`seasonal_chest_${chestId}`)
      .setLabel(expired ? "Expirat" : claimed ? "Revendicat" : "Revendică comoara sezonieră")
      .setEmoji(unavailable ? "✅" : "🎁")
      .setStyle(unavailable ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(unavailable),
  );
}

export async function saveSeasonalChest(chest: SeasonalChest): Promise<void> {
  await saveState(stateKey(chest.guildId, `seasonal:${chest.id}`), chest);
  await saveState(stateKey(chest.guildId, SEASONAL_ACTIVE_SUFFIX), { id: chest.id });
}

function seasonalId(bucket: number): string {
  return `seasonal_${bucket}`;
}

async function loadSeasonalChest(guildId: string, bucket = Math.floor(Date.now() / SEASONAL_CHEST_INTERVAL_MS)): Promise<SeasonalChest | null> {
  return loadState<SeasonalChest>(stateKey(guildId, `seasonal:${seasonalId(bucket)}`));
}

async function loadActiveSeasonalChest(guildId: string): Promise<SeasonalChest | null> {
  const pointer = await loadState<{ id?: string }>(stateKey(guildId, SEASONAL_ACTIVE_SUFFIX));
  if (pointer?.id) {
    return loadState<SeasonalChest>(stateKey(guildId, `seasonal:${pointer.id}`));
  }
  // Read the old hourly key for backwards compatibility with chests created
  // before seasonal spawns moved to the message milestone.
  return loadSeasonalChest(guildId);
}

export async function getSeasonalChest(guildId: string, chestId: string): Promise<SeasonalChest | null> {
  return loadState<SeasonalChest>(stateKey(guildId, `seasonal:${chestId}`));
}

async function deleteSeasonalChestMessage(client: Client, chest: SeasonalChest): Promise<void> {
  const channel = await client.channels.fetch(chest.channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return;
  const message = await channel.messages.fetch(chest.messageId).catch(() => null);
  await message?.delete().catch(() => null);
}

async function deleteHiddenChestMessage(client: Client, chest: HiddenChest): Promise<void> {
  const channel = await client.channels.fetch(chest.channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return;
  const message = await channel.messages.fetch(chest.messageId).catch(() => null);
  await message?.delete().catch(() => null);
}

export function scheduleHiddenChestMessageDeletion(
  client: Client,
  chest: HiddenChest,
  cleanupAt = chest.cleanupAt ?? chest.expiresAt,
): void {
  const timer = setTimeout(() => {
    void deleteHiddenChestMessage(client, chest).catch(() => null);
  }, Math.max(0, cleanupAt - Date.now()));
  timer.unref?.();
}

export function scheduleSeasonalChestMessageDeletion(client: Client, chest: SeasonalChest): void {
  const cleanupAt = chest.cleanupAt ?? Date.now() + SEASONAL_CHEST_MESSAGE_RETENTION_MS;
  const timer = setTimeout(() => {
    void deleteSeasonalChestMessage(client, chest).catch(() => null);
  }, Math.max(0, cleanupAt - Date.now()));
  timer.unref?.();
}

async function expireSeasonalChest(client: Client, chest: SeasonalChest): Promise<void> {
  if (chest.claimed) return;
  const current = await loadState<SeasonalChest>(
    stateKey(chest.guildId, `seasonal:${chest.id}`),
  );
  if (!current || current.id !== chest.id || current.claimed || current.expiresAt > Date.now()) return;
  const expired = {
    ...current,
    cleanupAt: Date.now() + SEASONAL_CHEST_MESSAGE_RETENTION_MS,
  };
  await saveState(stateKey(expired.guildId, `seasonal:${expired.id}`), expired);
  const channel = await client.channels.fetch(chest.channelId).catch(() => null);
  if (channel instanceof TextChannel && !isTicketCategoryParentId(channel.parentId, channel.guildId)) {
    const message = await channel.messages.fetch(chest.messageId).catch(() => null);
    await message?.edit({
      embeds: [buildSeasonalChestEmbed(expired, false, true)],
      components: [seasonalChestRow(expired.id, false, true)],
    }).catch(() => null);
  }
  scheduleSeasonalChestMessageDeletion(client, expired);
}

export async function spawnSeasonalChest(client: Client, guildId: string): Promise<SeasonalChest | null> {
  const bucket = Math.floor(Date.now() / SEASONAL_CHEST_INTERVAL_MS);
  const current = await loadActiveSeasonalChest(guildId);
  if (current && current.expiresAt > Date.now() && !current.claimed) return current;
  if (current && isSeasonalChestOnCooldown(current)) return null;

  const channelId = getChannel("main", guildId);
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (!(channel instanceof TextChannel) || isTicketCategoryParentId(channel.parentId, channel.guildId)) return null;

  const meta = seasonalForBucket(bucket);
  const chest: SeasonalChest = {
    id: `seasonal_${Date.now()}`,
    guildId,
    channelId: channel.id,
    messageId: "",
    season: meta.season,
    openedAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    claimed: false,
  };
  const message = await channel.send({
    content: `🌒 **${meta.label}** a trecut pragul Regatului pentru scurt timp!`,
    embeds: [buildSeasonalChestEmbed(chest)],
    components: [seasonalChestRow(chest.id)],
  });
  chest.messageId = message.id;
  await saveSeasonalChest(chest);
  const timer = setTimeout(() => {
    void expireSeasonalChest(client, chest).catch(() => null);
  }, Math.max(0, chest.expiresAt - Date.now()));
  timer.unref?.();
  return chest;
}

export async function rehydrateSeasonalChest(client: Client, guildId: string): Promise<void> {
  const chest = await loadActiveSeasonalChest(guildId);
  if (!chest) return;
  if (chest.claimed) {
    if (chest.cleanupAt) scheduleSeasonalChestMessageDeletion(client, chest);
    return;
  }
  if (chest.expiresAt <= Date.now()) {
    await expireSeasonalChest(client, chest);
    return;
  }
  const timer = setTimeout(() => {
    void expireSeasonalChest(client, chest).catch(() => null);
  }, chest.expiresAt - Date.now());
  timer.unref?.();
}

export async function claimSeasonalChest(
  guildId: string,
  chestId: string,
  userId: string,
  username: string,
): Promise<SeasonalChest | null> {
  const key = stateKey(guildId, `seasonal:${chestId}`);
  await ensureBotStateTable();
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
      SET value = jsonb_set(
        jsonb_set(
          jsonb_set(value::jsonb, '{claimed}', 'true'::jsonb, true),
          '{cleanupAt}', to_jsonb($3::bigint), true
        ),
        '{claimedBy}', jsonb_build_object('userId', $4::text, 'username', $5::text), true
      )::text,
         updated_at = now()
     WHERE key = $1 AND COALESCE((value::jsonb->>'claimed')::boolean, false) = false
       AND (value::jsonb->>'expiresAt')::bigint > $2
     RETURNING value`,
    [key, Date.now(), Date.now() + SEASONAL_CHEST_MESSAGE_RETENTION_MS, userId, username],
  );
  return result.rows[0] ? JSON.parse(result.rows[0].value) as SeasonalChest : null;
}

export interface HiddenChest {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  rewardGold: number;
  rewardXp: number;
  expiresAt: number;
  claimed: boolean;
  claimedBy?: {
    userId: string;
    username: string;
  };
  cleanupAt?: number;
}

export const HIDDEN_CHEST_MESSAGE_RETENTION_MS = 20 * 60 * 1000;

export function buildOracleClueEmbed(answer: string, expiresAt?: number): EmbedBuilder {
  const clues: Record<string, string> = {
    cenusa: "Acolo unde totul se sfârșește, cenușa păstrează primul cuvânt al porții.",
    ecou: "Al treilea ecou nu strigă; el repetă numele lucrului care nu moare.",
    luna: "Când luna stinsă privește turnul, spune-i numele și piatra se va mișca.",
    umbra: "Nicio flacără nu o poate ucide. Urmează ceea ce rămâne în urma ta.",
  };
  return new EmbedBuilder()
    .setColor(0x20202d)
    .setTitle("🔮 Șoapta Oracolului — un cufăr ascuns")
    .setDescription(
      `*${clues[answer] ?? clues.cenusa}*\n\n` +
        "Răspunde prin reply la acest mesaj cu un singur cuvânt. Primul răspuns corect va deschide drumul." +
        (expiresAt ? `\n\n⏳ Indiciul dispare <t:${Math.floor(expiresAt / 1000)}:R>.` : ""),
    )
    .setImage(CHEST_WORLD_IMG.oracle)
    .setFooter({ text: "Cufărul Șoaptelor Oracolului • " + BRAND_FOOTER });
}

export function buildHiddenChestEmbed(chest: HiddenChest, claimed = false): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x30354a)
    .setTitle("👁️ Cufărul Șoaptelor Oracolului")
    .setDescription(
      claimed
        ? `Poarta secretă s-a închis. Comoara a fost luată${chest.claimedBy?.username ? ` de **${chest.claimedBy.username.replace(/[<>]/g, "").slice(0, 80)}**` : ""}.`
        : `Ai dezlegat șoapta. Înăuntru se află **${chest.rewardGold} Oboli**, **${chest.rewardXp} XP** și un fragment de relicvă.\n\n*Doar primul care atinge sigiliul îl poate revendica.*\n\n⏳ Sigiliul se închide <t:${Math.floor(chest.expiresAt / 1000)}:R>.`,
    )
    .setImage(CHEST_WORLD_IMG.oracle)
    .setFooter({ text: "Cufăr secret • timer live în Discord" });
}

export function hiddenChestRow(chestId: string, claimed = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hidden_chest_${chestId}`)
      .setLabel(claimed ? "Sigiliu închis" : "Atinge sigiliul")
      .setEmoji(claimed ? "✅" : "👁️")
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setDisabled(claimed),
  );
}

async function claimClue(guildId: string, messageId: string, userId: string): Promise<boolean> {
  const key = stateKey(guildId, "oracle_clue");
  await ensureBotStateTable();
  const result = await pool.query(
    `UPDATE bot_state
     SET value = jsonb_set(
       jsonb_set(value::jsonb, '{status}', '"solved"'::jsonb, true),
       '{solverId}', to_jsonb($3::text), true
     )::text, updated_at = now()
     WHERE key = $1 AND value::jsonb->>'messageId' = $2
       AND value::jsonb->>'status' = 'active'
       AND (value::jsonb->>'expiresAt')::bigint > $4
     RETURNING value`,
    [key, messageId, userId, Date.now()],
  );
  return result.rowCount === 1;
}

export async function maybeHandleOracleClue(
  client: Client,
  message: Message,
): Promise<void> {
  if (!message.guildId || message.author.bot) return;
  const guildId = message.guildId;
  const current = await loadState<{ status: string; messageId: string; answer: string; expiresAt: number }>(
    stateKey(guildId, "oracle_clue"),
  );
  if (
    current?.status === "active" &&
    current.expiresAt > Date.now() &&
    message.reference?.messageId === current.messageId &&
    normalizeAnswer(message.content) === current.answer &&
    await claimClue(guildId, current.messageId, message.author.id)
  ) {
    const channel = message.channel;
    if (!(channel instanceof TextChannel)) return;
    const chestId = `oracle_${Date.now()}`;
    const chest: HiddenChest = {
      id: chestId,
      guildId,
      channelId: channel.id,
      messageId: "",
      rewardGold: 1000,
      rewardXp: 500,
      expiresAt: Date.now() + 20 * 60 * 1000,
      claimed: false,
    };
    const sent = await channel.send({
      content: `🔮 **${message.author.username}** a dezlegat șoapta! Cufărul secret a ieșit din zid.`,
      embeds: [buildHiddenChestEmbed(chest)],
      components: [hiddenChestRow(chestId)],
    });
    chest.messageId = sent.id;
    await saveState(stateKey(guildId, `hidden:${chestId}`), chest);
    const solvedClue = await loadState<Record<string, unknown>>(stateKey(guildId, "oracle_clue"));
    await saveState(stateKey(guildId, "oracle_clue"), {
      ...(solvedClue ?? {}),
      status: "solved",
      hiddenChestId: chestId,
    });
    scheduleHiddenChestMessageDeletion(client, chest);
    return;
  }

  if (current?.status === "active" && current.expiresAt > Date.now()) return;
  if (Math.random() > 0.012) return;
  if (!(message.channel instanceof TextChannel)) return;
  const answers = ["cenusa", "ecou", "luna", "umbra"];
  const answer = answers[Math.floor(Math.random() * answers.length)]!;
  const clueExpiresAt = Date.now() + 10 * 60 * 1000;
  const clueMessage = await message.channel.send({ embeds: [buildOracleClueEmbed(answer, clueExpiresAt)] });
  await saveState(stateKey(guildId, "oracle_clue"), {
    status: "active",
    guildId,
    messageId: clueMessage.id,
    channelId: message.channel.id,
    answer,
    createdAt: Date.now(),
    expiresAt: clueExpiresAt,
  });
}

function normalizeAnswer(value: string): string {
  return value.trim().toLocaleLowerCase("ro-RO").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export async function claimHiddenChest(
  guildId: string,
  chestId: string,
  userId: string,
  username: string,
): Promise<HiddenChest | null> {
  const key = stateKey(guildId, `hidden:${chestId}`);
  await ensureBotStateTable();
  const now = Date.now();
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
     SET value = jsonb_set(
        jsonb_set(
          jsonb_set(value::jsonb, '{claimed}', 'true'::jsonb, true),
          '{claimedBy}', jsonb_build_object('userId', $3::text, 'username', $4::text), true
        ),
        '{cleanupAt}', to_jsonb($5::bigint), true
     )::text,
         updated_at = now()
     WHERE key = $1 AND COALESCE((value::jsonb->>'claimed')::boolean, false) = false
       AND (value::jsonb->>'expiresAt')::bigint > $2
     RETURNING value`,
    [key, now, userId, username, now + HIDDEN_CHEST_MESSAGE_RETENTION_MS],
  );
  return result.rows[0] ? JSON.parse(result.rows[0].value) as HiddenChest : null;
}

export async function rehydrateHiddenChest(client: Client, guildId: string): Promise<void> {
  const clue = await loadState<{ hiddenChestId?: string }>(stateKey(guildId, "oracle_clue"));
  if (!clue?.hiddenChestId) return;
  const chest = await loadState<HiddenChest>(stateKey(guildId, `hidden:${clue.hiddenChestId}`));
  if (!chest) return;
  scheduleHiddenChestMessageDeletion(
    client,
    chest,
    chest.cleanupAt ?? (chest.claimed ? Date.now() + HIDDEN_CHEST_MESSAGE_RETENTION_MS : chest.expiresAt),
  );
}

export interface AuctionState {
  id: string;
  guildId: string;
  offer: "key_bundle" | "relic_swap" | "mystery";
  label: string;
  description: string;
  endsAt: number;
  highestBid: number;
  bidderId: string | null;
  status: "open" | "settled";
  channelId?: string | null;
  messageId?: string | null;
}

export const AUCTION_DURATION_MS = 6 * 60 * 60 * 1000;
const AUCTION_OFFERS = [
  { offer: "key_bundle", label: "Legătura celor Trei Chei", description: "Un pachet de chei rare, sigilat cu ceară neagră." },
  { offer: "relic_swap", label: "Schimbul de Relicve Duplicate", description: "Doi fragmenți identici pot fi preschimbați în unul mai rar." },
  { offer: "mystery", label: "Cufărul cu Preț Ascuns", description: "Nimeni nu știe ce doarme înăuntru până când ciocanul cade." },
] as const;

export async function getAuction(guildId: string): Promise<AuctionState> {
  const bucket = Math.floor(Date.now() / AUCTION_DURATION_MS);
  const id = `auction_${bucket}`;
  const key = stateKey(guildId, "auction");
  const stored = await loadState<AuctionState>(key);
  if (stored?.id === id && stored.status === "open") return stored;
  if (stored?.status === "open" && stored.bidderId && stored.highestBid > 0 && stored.endsAt <= Date.now()) {
    const settled = await settleAuction(stored);
    if (settled) return createAuction(guildId, id, bucket);
  }
  if (stored?.id === id && stored.status === "settled") return createAuction(guildId, id, bucket);
  return createAuction(guildId, id, bucket);
}

async function createAuction(guildId: string, id: string, bucket: number): Promise<AuctionState> {
  const meta = AUCTION_OFFERS[bucket % AUCTION_OFFERS.length]!;
  const auction: AuctionState = {
    id,
    guildId,
    offer: meta.offer,
    label: meta.label,
    description: meta.description,
    endsAt: (bucket + 1) * AUCTION_DURATION_MS,
    highestBid: 0,
    bidderId: null,
    status: "open",
    channelId: null,
    messageId: null,
  };
  await saveState(stateKey(guildId, "auction"), auction);
  return auction;
}

export async function attachAuctionMessage(
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<AuctionState> {
  const auction = await getAuction(guildId);
  const updated = { ...auction, channelId, messageId };
  await saveState(stateKey(guildId, "auction"), updated);
  return updated;
}

async function settleAuction(auction: AuctionState): Promise<AuctionState | null> {
  const key = stateKey(auction.guildId, "auction");
  const result = await pool.query<{ value: string }>(
    `UPDATE bot_state
     SET value = jsonb_set(value::jsonb, '{status}', '"settled"'::jsonb, true)::text,
         updated_at = now()
     WHERE key = $1 AND value::jsonb->>'id' = $2 AND value::jsonb->>'status' = 'open'
     RETURNING value`,
    [key, auction.id],
  );
  if (!result.rows[0]) return null;
  const settled = JSON.parse(result.rows[0].value) as AuctionState;
  if (settled.bidderId) {
    if (settled.offer === "key_bundle") await addPlayerKey(settled.bidderId, settled.guildId, "fum");
    if (settled.offer === "relic_swap") await addPlayerItem(settled.bidderId, settled.guildId, "relic_ochiul", 1);
    if (settled.offer === "mystery") {
      await addPlayerGold(settled.bidderId, settled.guildId, 900);
      await addPlayerItem(settled.bidderId, settled.guildId, "fragment_coroana", 1);
    }
  }
  return settled;
}

export async function placeAuctionBid(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ ok: boolean; auction: AuctionState; message: string }> {
  const auction = await getAuction(guildId);
  if (auction.endsAt <= Date.now()) {
    return { ok: false, auction, message: "Licitația s-a închis. Așteaptă următoarea ofertă." };
  }
  const bid = Math.max(1, Math.floor(amount));
  if (bid <= auction.highestBid) {
    return { ok: false, auction, message: `Oferta ta trebuie să depășească **${auction.highestBid} Oboli**.` };
  }
  const paid = await tryDeductPlayerGold(userId, guildId, bid);
  if (!paid) return { ok: false, auction, message: "Nu ai destui Oboli pentru această ofertă." };
  if (auction.bidderId && auction.highestBid > 0) {
    await addPlayerGold(auction.bidderId, guildId, auction.highestBid);
  }
  const updated = { ...auction, bidderId: userId, highestBid: bid };
  await saveState(stateKey(guildId, "auction"), updated);
  return { ok: true, auction: updated, message: `Ai preluat conducerea cu **${bid} Oboli**.` };
}

export async function settleExpiredAuction(guildId: string): Promise<AuctionState | null> {
  const stored = await loadState<AuctionState>(stateKey(guildId, "auction"));
  if (!stored || stored.status !== "open" || stored.endsAt > Date.now()) return null;
  return settleAuction(stored);
}

export function buildAuctionEmbed(auction: AuctionState): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x241c20)
    .setTitle("⚒️ Târgul Negru al Negustorului")
    .setDescription(
      `**${auction.label}**\n${auction.description}\n\n` +
        `💰 Oferta curentă: **${auction.highestBid} Oboli**\n` +
        `🏴 Conduce: ${auction.bidderId ? "*un ofertant*" : "*nimeni încă*"}\n` +
        `⏳ Se închide <t:${Math.floor(auction.endsAt / 1000)}:R>\n\n` +
        "Apasă **Licitează** și introdu o ofertă mai mare. Dacă ești depășit, Obolii îți sunt restituiți.\n" +
        "Poți folosi și `/licitatie suma` pentru o ofertă rapidă.",
    )
    .setImage(CHEST_WORLD_IMG.auction)
    .setFooter({ text: BRAND_FOOTER });
}

export function auctionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("auction_bid")
      .setLabel("Licitează")
      .setEmoji("⚒️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("auction_refresh")
      .setLabel("Actualizează")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
  );
}

export function isRelicItemKey(key: string): boolean {
  return key.startsWith("fragment_");
}

export async function exchangeDuplicateRelic(
  discordId: string,
  guildId: string,
): Promise<string | null> {
  const items = await getPlayerItems(discordId, guildId);
  const duplicate = items.find((item) => isRelicItemKey(item.itemKey) && item.quantity >= 2);
  if (!duplicate) return null;
  const ok = await consumePlayerItems(discordId, guildId, { [duplicate.itemKey]: 2 });
  if (!ok) return null;
  await addPlayerItem(discordId, guildId, "fragment_ochiul_cenușii", 1);
  return duplicate.itemKey;
}

export function corruptedKeyLabel(): string {
  return "Cheia Pângărită";
}

export function corruptedKeyImage(): string | null {
  return CHEST_WORLD_IMG.corruptedKey;
}

export async function purifyCorruptedKey(discordId: string, guildId: string): Promise<boolean> {
  const consumed = await consumePlayerItems(discordId, guildId, { fragment_cenusa: 3 });
  if (!consumed) return false;
  await addPlayerKey(discordId, guildId, "rar");
  return true;
}

export function randomCorruptedKeyDrop(): boolean {
  return Math.random() < 0.025;
}

export function corruptedKeyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5d2848)
    .setTitle("☠️ Cheia Pângărită")
    .setDescription(
      "O cheie neagră, brăzdată de fisuri violete, a ieșit din cenușă.\n\n" +
        "🔓 Poate deschide orice cufăr blocat, dar are șansa de a **mistui recompensa**.\n" +
        "🧪 O poți purifica folosind **3× Fragment de Cenușă**.\n" +
        "🏚️ Sau păstreaz-o pentru un cufăr pângărit special.",
    )
    .setImage(CHEST_WORLD_IMG.corruptedKey)
    .setFooter({ text: BRAND_FOOTER });
}

export type { KeyType };