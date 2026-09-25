import {
  Client,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getChannel } from "./channel-config";
import {
  DEFAULT_DAILY_STATS_EMBED_CONFIG,
  loadDailyStatsEmbedConfig,
  type DailyStatsEmbedConfig,
} from "./db";
import { publicMessageImageUrl } from "./message-media";

const STATS_TIME_ZONE = process.env.DISCORD_STATS_TIMEZONE || "Europe/Bucharest";
const REPORT_CHECK_INTERVAL_MS = 60 * 1000;
const schedulerTimers = new Map<string, ReturnType<typeof setInterval>>();
const lastReportSkipByGuild = new Map<string, string>();
let schemaReady: Promise<void> | null = null;

function warnDailyStatsReportSkipped(
  guildId: string,
  day: string,
  reason: string,
  context: Record<string, unknown> = {},
): void {
  const warningKey = `${day}:${reason}:${String(context.channelId ?? "")}`;
  if (lastReportSkipByGuild.get(guildId) === warningKey) return;
  lastReportSkipByGuild.set(guildId, warningKey);
  logger.warn({ guildId, day, reason, ...context }, "Daily Discord statistics report skipped");
}

export interface DailyStatsReport {
  guildId: string;
  day: string;
  metrics: {
    messages: number;
    uniqueUsers: number;
    boosts: number;
    joins: number;
    leaves: number;
    peakVoice: number;
  };
  activity: Array<{ day: string; messages: number }>;
  topChannels: Array<{ channelId: string; channelName: string; messages: number }>;
}

function dayParts(timestamp: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function statsDay(timestamp = Date.now()): string {
  const parts = dayParts(timestamp);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function completedStatsDay(timestamp = Date.now()): string {
  return previousDay(statsDay(timestamp));
}

function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function daysEndingAt(day: string, count: number): string[] {
  const result: string[] = [];
  let current = day;
  for (let index = 0; index < count; index += 1) {
    result.unshift(current);
    current = previousDay(current);
  }
  return result;
}

export function formatStatsDay(day: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "long",
    timeZone: STATS_TIME_ZONE,
  }).format(new Date(`${day}T12:00:00.000Z`));
}

export async function ensureDailyStatsTables(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS discord_daily_stats (
        guild_id text NOT NULL,
        day text NOT NULL,
        message_count integer NOT NULL DEFAULT 0,
        joins integer NOT NULL DEFAULT 0,
        leaves integer NOT NULL DEFAULT 0,
        boosts integer NOT NULL DEFAULT 0,
        peak_voice integer NOT NULL DEFAULT 0,
        report_message_id text,
        reported_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, day)
      );
      CREATE TABLE IF NOT EXISTS discord_daily_channels (
        guild_id text NOT NULL,
        day text NOT NULL,
        channel_id text NOT NULL,
        channel_name text NOT NULL,
        message_count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (guild_id, day, channel_id)
      );
      CREATE TABLE IF NOT EXISTS discord_daily_users (
        guild_id text NOT NULL,
        day text NOT NULL,
        user_id text NOT NULL,
        PRIMARY KEY (guild_id, day, user_id)
      );
      CREATE INDEX IF NOT EXISTS discord_daily_stats_guild_day_idx
        ON discord_daily_stats (guild_id, day);
      CREATE INDEX IF NOT EXISTS discord_daily_channels_guild_day_idx
        ON discord_daily_channels (guild_id, day);
    `).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function incrementMetric(
  guildId: string,
  day: string,
  metric: "joins" | "leaves" | "boosts",
): Promise<void> {
  await ensureDailyStatsTables();
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, ${metric}, updated_at)
     VALUES ($1, $2, 1, now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET ${metric} = discord_daily_stats.${metric} + 1, updated_at = now()`,
    [guildId, day],
  );
}

export async function recordDailyMessage(
  guildId: string,
  userId: string,
  channelId: string,
  channelName: string,
  timestamp = Date.now(),
): Promise<void> {
  await ensureDailyStatsTables();
  const day = statsDay(timestamp);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO discord_daily_stats (guild_id, day, message_count, updated_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (guild_id, day) DO UPDATE
       SET message_count = discord_daily_stats.message_count + 1, updated_at = now()`,
      [guildId, day],
    );
    await client.query(
      `INSERT INTO discord_daily_channels (guild_id, day, channel_id, channel_name, message_count, updated_at)
       VALUES ($1, $2, $3, $4, 1, now())
       ON CONFLICT (guild_id, day, channel_id) DO UPDATE
       SET channel_name = EXCLUDED.channel_name,
           message_count = discord_daily_channels.message_count + 1,
           updated_at = now()`,
      [guildId, day, channelId, channelName],
    );
    await client.query(
      `INSERT INTO discord_daily_users (guild_id, day, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, day, user_id) DO NOTHING`,
      [guildId, day, userId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordDailyJoin(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "joins");
}

export async function recordDailyLeave(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "leaves");
}

export async function recordDailyBoost(guildId: string, timestamp = Date.now()): Promise<void> {
  return incrementMetric(guildId, statsDay(timestamp), "boosts");
}

export async function recordDailyVoicePeak(
  guildId: string,
  connectedMembers: number,
  timestamp = Date.now(),
): Promise<void> {
  await ensureDailyStatsTables();
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, peak_voice, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET peak_voice = GREATEST(discord_daily_stats.peak_voice, EXCLUDED.peak_voice),
         updated_at = now()`,
    [guildId, statsDay(timestamp), Math.max(0, connectedMembers)],
  );
}

export async function getDailyStats(guildId: string, day = statsDay()): Promise<DailyStatsReport> {
  await ensureDailyStatsTables();
  const activityDays = daysEndingAt(day, 7);
  const [statsResult, usersResult, channelsResult, activityResult] = await Promise.all([
    pool.query<{
      message_count: number;
      joins: number;
      leaves: number;
      boosts: number;
      peak_voice: number;
    }>(
      `SELECT message_count, joins, leaves, boosts, peak_voice
       FROM discord_daily_stats WHERE guild_id = $1 AND day = $2`,
      [guildId, day],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM discord_daily_users WHERE guild_id = $1 AND day = $2`,
      [guildId, day],
    ),
    pool.query<{ channel_id: string; channel_name: string; message_count: number }>(
      `SELECT channel_id, channel_name, message_count
       FROM discord_daily_channels
       WHERE guild_id = $1 AND day = $2
       ORDER BY message_count DESC, channel_name ASC
       LIMIT 5`,
      [guildId, day],
    ),
    pool.query<{ day: string; message_count: number }>(
      `SELECT day, message_count
       FROM discord_daily_stats
       WHERE guild_id = $1 AND day = ANY($2::text[])
       ORDER BY day ASC`,
      [guildId, activityDays],
    ),
  ]);
  const row = statsResult.rows[0];
  const activityByDay = new Map(activityResult.rows.map((item) => [item.day, Number(item.message_count)]));

  return {
    guildId,
    day,
    metrics: {
      messages: Number(row?.message_count ?? 0),
      uniqueUsers: Number(usersResult.rows[0]?.count ?? 0),
      boosts: Number(row?.boosts ?? 0),
      joins: Number(row?.joins ?? 0),
      leaves: Number(row?.leaves ?? 0),
      peakVoice: Number(row?.peak_voice ?? 0),
    },
    activity: activityDays.map((activityDay) => ({
      day: activityDay,
      messages: activityByDay.get(activityDay) ?? 0,
    })),
    topChannels: channelsResult.rows.map((channel) => ({
      channelId: channel.channel_id,
      channelName: channel.channel_name,
      messages: Number(channel.message_count),
    })),
  };
}

function renderDailyStatsText(
  template: string,
  guildName: string,
  report: DailyStatsReport,
): string {
  const values: Record<string, string> = {
    guild: guildName,
    date: formatStatsDay(report.day),
    messages: report.metrics.messages.toLocaleString("ro-RO"),
    uniqueUsers: report.metrics.uniqueUsers.toLocaleString("ro-RO"),
    boosts: report.metrics.boosts.toLocaleString("ro-RO"),
    joins: report.metrics.joins.toLocaleString("ro-RO"),
    leaves: report.metrics.leaves.toLocaleString("ro-RO"),
    peakVoice: report.metrics.peakVoice.toLocaleString("ro-RO"),
  };
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

export function resolveDailyStatsChannelId(configuredChannelId: string, guildId: string): string | null {
  return configuredChannelId || getChannel("main", guildId);
}

export function buildDailyStatsEmbed(
  guildName: string,
  report: DailyStatsReport,
  config: DailyStatsEmbedConfig = DEFAULT_DAILY_STATS_EMBED_CONFIG,
): EmbedBuilder {
  const activityText = report.activity
    .map((item) => `${item.day.slice(8, 10)}/${item.day.slice(5, 7)}: ${item.messages.toLocaleString("ro-RO")}`)
    .join(" · ") || "Nicio activitate în ultimele 7 zile.";
  const channelText = report.topChannels.length > 0
    ? report.topChannels
      .map((item, index) => `${index + 1}. **#${item.channelName}** · ${item.messages.toLocaleString("ro-RO")} mesaje`)
      .join("\n")
    : config.emptyChannelsText;
  const metricLines = ([
    [
      [config.metricLabels.messages, report.metrics.messages],
      [config.metricLabels.uniqueUsers, report.metrics.uniqueUsers],
    ],
    [
      [config.metricLabels.boosts, report.metrics.boosts],
      [config.metricLabels.joins, report.metrics.joins],
    ],
    [
      [config.metricLabels.leaves, report.metrics.leaves],
      [config.metricLabels.peakVoice, report.metrics.peakVoice],
    ],
  ] as const).map((row) => row
    .map(([label, value]) => `${label.replace(/\s+/g, " ").trim()}: **${value.toLocaleString("ro-RO")}**`)
    .join(" · "));
  const metricFields: { name: string; value: string; inline: false }[] = [];
  let metricValue = "";
  for (const line of metricLines) {
    const nextValue = metricValue ? `${metricValue}\n${line}` : line;
    if (metricValue && nextValue.length > 1024) {
      metricFields.push({
        name: metricFields.length === 0 ? "📊 Rezumat" : "📊 Rezumat (continuare)",
        value: metricValue,
        inline: false,
      });
      metricValue = line;
    } else {
      metricValue = nextValue;
    }
  }
  if (metricValue) {
    metricFields.push({
      name: metricFields.length === 0 ? "📊 Rezumat" : "📊 Rezumat (continuare)",
      value: metricValue,
      inline: false,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(Number.parseInt(config.color.slice(1), 16))
    .setAuthor({ name: "ORACOLUL CENUȘII · COMMUNITY INSIGHTS" })
    .setTitle(renderDailyStatsText(config.title, guildName, report))
    .setDescription(renderDailyStatsText(config.description, guildName, report))
    .addFields(
      ...metricFields,
      { name: config.activityTitle, value: activityText },
      { name: config.channelsTitle, value: channelText },
    )
    .setFooter({ text: config.footer })
    .setTimestamp(new Date(`${report.day}T12:00:00.000Z`));
  const imageUrl = publicMessageImageUrl(config.imageUrl);
  const thumbnailUrl = publicMessageImageUrl(config.thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

async function isReportPublished(guildId: string, day: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT report_message_id FROM discord_daily_stats WHERE guild_id = $1 AND day = $2`,
    [guildId, day],
  );
  return Boolean(result.rows[0]?.report_message_id);
}

async function markReportPublished(guildId: string, day: string, messageId: string): Promise<void> {
  await pool.query(
    `INSERT INTO discord_daily_stats (guild_id, day, report_message_id, reported_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (guild_id, day) DO UPDATE
     SET report_message_id = EXCLUDED.report_message_id, reported_at = now(), updated_at = now()`,
    [guildId, day, messageId],
  );
}

export async function publishDailyStatsReport(client: Client, guildId: string, day: string): Promise<boolean> {
  await ensureDailyStatsTables();
  if (await isReportPublished(guildId, day)) return false;
  const config = await loadDailyStatsEmbedConfig(guildId);
  const channelId = resolveDailyStatsChannelId(config.channelId, guildId);
  if (!channelId) {
    warnDailyStatsReportSkipped(guildId, day, "target_channel_not_configured");
    return false;
  }

  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    warnDailyStatsReportSkipped(guildId, day, "main_channel_fetch_failed", { channelId, error });
    return false;
  }
  if (!(channel instanceof TextChannel) || channel.guildId !== guildId) {
    warnDailyStatsReportSkipped(guildId, day, "main_channel_not_text", {
      channelId,
      channelType: channel?.type ?? null,
    });
    return false;
  }

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    warnDailyStatsReportSkipped(guildId, day, "guild_unavailable", { channelId });
    return false;
  }
  const report = await getDailyStats(guildId, day);
  const message = await channel.send({ embeds: [buildDailyStatsEmbed(guild.name, report, config)] });
  await markReportPublished(guildId, day, message.id);
  lastReportSkipByGuild.delete(guildId);
  logger.info({ guildId, day, channelId, messageId: message.id }, "Published daily Discord statistics report");
  return true;
}

export function startDailyStatsScheduler(client: Client, guildId: string): void {
  if (schedulerTimers.has(guildId)) return;
  logger.info({ guildId }, "Started daily Discord statistics scheduler");
  const timer = setInterval(() => {
    const currentDay = statsDay();
    const reportDay = previousDay(currentDay);
    void publishDailyStatsReport(client, guildId, reportDay).catch((error) =>
      logger.warn({ error, guildId, reportDay }, "Daily Discord statistics report failed"),
    );
  }, REPORT_CHECK_INTERVAL_MS);
  timer.unref?.();
  schedulerTimers.set(guildId, timer);
}

export function stopDailyStatsScheduler(guildId: string): void {
  const timer = schedulerTimers.get(guildId);
  if (!timer) return;
  clearInterval(timer);
  schedulerTimers.delete(guildId);
}