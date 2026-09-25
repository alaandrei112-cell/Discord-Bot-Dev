import {
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  Invite,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  loadInviteTrackingConfig,
  type InviteTrackingConfig,
} from "./db";
import { statsDay } from "./daily-stats";

const INVITE_SYNC_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS discord_invite_links (
    guild_id text NOT NULL,
    invite_code text NOT NULL,
    channel_id text,
    inviter_id text,
    inviter_name text,
    discord_uses integer NOT NULL DEFAULT 0,
    max_uses integer,
    expires_at timestamptz,
    active boolean NOT NULL DEFAULT true,
    last_synced_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, invite_code)
  );
  CREATE TABLE IF NOT EXISTS discord_invite_daily (
    guild_id text NOT NULL,
    day text NOT NULL,
    invite_code text NOT NULL DEFAULT '',
    join_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, day, invite_code)
  );
  CREATE TABLE IF NOT EXISTS discord_invite_reports (
    guild_id text NOT NULL,
    report_key text NOT NULL,
    claim_token text,
    claim_expires_at timestamptz,
    message_id text,
    reported_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, report_key)
  );
  CREATE INDEX IF NOT EXISTS discord_invite_daily_guild_day_idx
    ON discord_invite_daily (guild_id, day);
`;

const JOIN_DEBOUNCE_MS = 900;
const REPORT_CHECK_INTERVAL_MS = 60 * 1000;
const INVITE_REPORT_CLAIM_MS = 2 * 60 * 1000;
const MAX_INVITE_ROWS = 250;

let schemaReady: Promise<void> | null = null;
const inviteStates = new Map<string, GuildInviteState>();
const activeConfigs = new Map<string, InviteTrackingConfig>();
const reportTimers = new Map<string, ReturnType<typeof setInterval>>();

interface GuildInviteState {
  usesByCode: Map<string, number>;
  pendingUsesByCode: Map<string, number>;
  queuedMembers: GuildMember[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  snapshotReady: boolean;
  operation: Promise<void>;
}

export interface InviteStatsRow {
  code: string;
  url: string;
  inviterId: string | null;
  inviterName: string | null;
  channelId: string | null;
  totalDiscordUses: number;
  attributedJoins: number;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
  lastSyncedAt: string | null;
}

export interface InviteStatsResponse {
  range: "7" | "30" | "90" | "all";
  startDay: string | null;
  endDay: string;
  totals: {
    attributedJoins: number;
    unknownJoins: number;
  };
  rows: InviteStatsRow[];
}

interface InviteSnapshotRow {
  guildId: string;
  code: string;
  channelId: string | null;
  inviterId: string | null;
  inviterName: string | null;
  uses: number;
  maxUses: number | null;
  expiresAt: Date | null;
}

export interface InviteReportPeriod {
  startDay: string;
  endDay: string;
  reportKey: string;
  frequency: "daily" | "weekly";
}

export function allocateInviteUseCredits(joinCount: number, pendingUsesByCode: Map<string, number>): Map<string, number> {
  const allocations = new Map<string, number>();
  let remainingJoins = Math.max(0, Math.floor(joinCount));
  const pending = [...pendingUsesByCode.entries()].sort((left, right) => right[1] - left[1]);
  for (const [code, availableUses] of pending) {
    if (remainingJoins <= 0) break;
    const attributed = Math.min(remainingJoins, Math.max(0, availableUses));
    if (attributed > 0) {
      allocations.set(code, attributed);
      remainingJoins -= attributed;
      const left = availableUses - attributed;
      if (left > 0) pendingUsesByCode.set(code, left);
      else pendingUsesByCode.delete(code);
    }
  }
  if (remainingJoins > 0) allocations.set("", remainingJoins);
  return allocations;
}

function stateFor(guildId: string): GuildInviteState {
  let state = inviteStates.get(guildId);
  if (!state) {
    state = {
      usesByCode: new Map(),
      pendingUsesByCode: new Map(),
      queuedMembers: [],
      flushTimer: null,
      snapshotReady: false,
      operation: Promise.resolve(),
    };
    inviteStates.set(guildId, state);
  }
  return state;
}

async function withGuildOperation<T>(state: GuildInviteState, operation: () => Promise<T>): Promise<T> {
  const previous = state.operation;
  let release!: () => void;
  state.operation = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function ensureInviteStatsTables(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(INVITE_SYNC_TABLES_SQL).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function toSnapshotRow(invite: Invite): InviteSnapshotRow | null {
  const guildId = invite.guild?.id;
  if (!guildId || !invite.code) return null;
  return {
    guildId,
    code: invite.code,
    channelId: invite.channelId ?? null,
    inviterId: invite.inviter?.id ?? null,
    inviterName: invite.inviter?.username ?? null,
    uses: Math.max(0, invite.uses ?? 0),
    maxUses: invite.maxUses != null && invite.maxUses > 0 ? invite.maxUses : null,
    expiresAt: invite.expiresAt ?? null,
  };
}

async function persistInviteSnapshots(
  guildId: string,
  rows: InviteSnapshotRow[],
  markMissingInactive = true,
): Promise<void> {
  await ensureInviteStatsTables();
  const syncedCodes = rows.map((row) => row.code);

  for (let start = 0; start < rows.length; start += 400) {
    const batch = rows.slice(start, start + 400);
    const params: unknown[] = [];
    const values = batch.map((row, index) => {
      const offset = index * 8;
      params.push(
        guildId,
        row.code,
        row.channelId,
        row.inviterId,
        row.inviterName,
        row.uses,
        row.maxUses,
        row.expiresAt,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, true, now())`;
    });
    await pool.query(
      `INSERT INTO discord_invite_links
         (guild_id, invite_code, channel_id, inviter_id, inviter_name, discord_uses, max_uses, expires_at, active, last_synced_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (guild_id, invite_code) DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         inviter_id = EXCLUDED.inviter_id,
         inviter_name = EXCLUDED.inviter_name,
         discord_uses = EXCLUDED.discord_uses,
         max_uses = EXCLUDED.max_uses,
         expires_at = EXCLUDED.expires_at,
         active = true,
         last_synced_at = now()`,
      params,
    );
  }

  if (markMissingInactive) {
    await pool.query(
      `UPDATE discord_invite_links
          SET active = false, last_synced_at = now()
        WHERE guild_id = $1 AND active = true AND NOT (invite_code = ANY($2::text[]))`,
      [guildId, syncedCodes],
    );
  }
}

function inviteManagerError(): Error {
  return new Error("Botul are nevoie de permisiunea Manage Server pentru a citi invitațiile serverului.");
}

async function fetchGuildInvites(guild: Guild): Promise<Invite[]> {
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw inviteManagerError();
  }
  const invites = await guild.invites.fetch();
  return [...invites.values()];
}

export async function syncGuildInviteSnapshot(guild: Guild): Promise<{ activeInvites: number; syncedAt: string }> {
  await ensureInviteStatsTables();
  const state = stateFor(guild.id);
  await flushQueuedInviteJoins(guild);
  return withGuildOperation(state, async () => {
    const invites = await fetchGuildInvites(guild);
    const rows = invites
      .map(toSnapshotRow)
      .filter((row): row is InviteSnapshotRow => row !== null);
    await persistInviteSnapshots(guild.id, rows);

    state.usesByCode = new Map(rows.map((row) => [row.code, row.uses]));
    state.snapshotReady = true;
    for (const code of state.pendingUsesByCode.keys()) {
      if (!state.usesByCode.has(code)) state.pendingUsesByCode.delete(code);
    }
    const syncedAt = new Date().toISOString();
    return { activeInvites: rows.length, syncedAt };
  });
}

async function persistDailyCounts(guildId: string, counts: Map<string, number>, timestamp = Date.now()): Promise<void> {
  const rows = [...counts.entries()].filter(([, count]) => count > 0);
  if (rows.length === 0) return;
  await ensureInviteStatsTables();
  const day = statsDay(timestamp);
  const params: unknown[] = [];
  const values = rows.map(([code, count], index) => {
    const offset = index * 4;
    params.push(guildId, day, code, count);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, now())`;
  });
  await pool.query(
    `INSERT INTO discord_invite_daily (guild_id, day, invite_code, join_count, updated_at)
     VALUES ${values.join(", ")}
     ON CONFLICT (guild_id, day, invite_code) DO UPDATE SET
       join_count = discord_invite_daily.join_count + EXCLUDED.join_count,
       updated_at = now()`,
    params,
  );
}

function scheduleJoinFlush(guild: Guild, state: GuildInviteState): void {
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flushQueuedInviteJoins(guild).catch((error) =>
      logger.warn({ error, guildId: guild.id }, "Invite join attribution batch failed"),
    );
  }, JOIN_DEBOUNCE_MS);
  state.flushTimer.unref?.();
}

export function queueInviteJoin(guild: Guild, member: GuildMember): void {
  if (!activeConfigs.get(guild.id)?.enabled) return;
  const state = stateFor(guild.id);
  state.queuedMembers.push(member);
  scheduleJoinFlush(guild, state);
}

export async function flushQueuedInviteJoins(guild: Guild): Promise<void> {
  const state = stateFor(guild.id);
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }

  await withGuildOperation(state, async () => {
    const members = state.queuedMembers.splice(0);
    const joinCount = members.length;
    if (joinCount <= 0 || !activeConfigs.get(guild.id)?.enabled) return;

    const counts = new Map<string, number>();
    let rowsForLog: InviteSnapshotRow[] = [];
    const inviteUseDeltas = new Map<string, number>();
    try {
      const invites = await fetchGuildInvites(guild);
      const rows = invites
        .map(toSnapshotRow)
        .filter((row): row is InviteSnapshotRow => row !== null);
      rowsForLog = rows;
      await persistInviteSnapshots(guild.id, rows);

      if (!state.snapshotReady) {
        state.usesByCode = new Map(rows.map((row) => [row.code, row.uses]));
        state.snapshotReady = true;
        counts.set("", joinCount);
        await persistDailyCounts(guild.id, counts);
        await publishInviteJoinLogs(guild, members, inviteUseDeltas, rowsForLog);
        return;
      }

      const nextUses = new Map<string, number>();
      for (const row of rows) {
        const previousUses = state.usesByCode.get(row.code);
        if (previousUses === undefined) {
          nextUses.set(row.code, row.uses);
          continue;
        }
        if (row.uses < previousUses) {
          state.pendingUsesByCode.delete(row.code);
        } else if (row.uses > previousUses) {
          inviteUseDeltas.set(row.code, row.uses - previousUses);
          state.pendingUsesByCode.set(
            row.code,
            (state.pendingUsesByCode.get(row.code) ?? 0) + row.uses - previousUses,
          );
        }
        nextUses.set(row.code, row.uses);
      }
      state.usesByCode = nextUses;

      for (const [code, count] of allocateInviteUseCredits(joinCount, state.pendingUsesByCode)) {
        counts.set(code, count);
      }
      await persistDailyCounts(guild.id, counts);
      await publishInviteJoinLogs(guild, members, inviteUseDeltas, rowsForLog);
    } catch (error) {
      counts.clear();
      counts.set("", joinCount);
      await persistDailyCounts(guild.id, counts).catch((persistError) =>
        logger.error({ error: persistError, guildId: guild.id }, "Could not store unattributed invite joins"),
      );
      await publishInviteJoinLogs(guild, members, new Map(), rowsForLog);
      logger.warn({ error, guildId: guild.id, joinCount }, "Could not fetch invites to attribute new members");
    }
  });

  if (state.queuedMembers.length > 0) scheduleJoinFlush(guild, state);
}

export async function recordCreatedInvite(invite: Invite): Promise<void> {
  const row = toSnapshotRow(invite);
  if (!row || !activeConfigs.get(row.guildId)?.enabled) return;
  await persistInviteSnapshots(row.guildId, [row], false);
  const state = stateFor(row.guildId);
  state.usesByCode.set(row.code, row.uses);
}

export async function recordDeletedInvite(invite: Invite): Promise<void> {
  const row = toSnapshotRow(invite);
  if (!row) return;
  await ensureInviteStatsTables();
  await pool.query(
    `UPDATE discord_invite_links
        SET active = false, discord_uses = $3, last_synced_at = now()
      WHERE guild_id = $1 AND invite_code = $2`,
    [row.guildId, row.code, row.uses],
  );
  const state = inviteStates.get(row.guildId);
  state?.usesByCode.delete(row.code);
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export async function getInviteStats(
  guildId: string,
  range: InviteStatsResponse["range"] = "7",
): Promise<InviteStatsResponse> {
  await ensureInviteStatsTables();
  const endDay = statsDay();
  const dayCount = range === "all" ? null : Number(range);
  const startDay = dayCount === null ? null : shiftDay(endDay, -(dayCount - 1));
  return getInviteStatsForDays(guildId, range, startDay, endDay);
}

async function getInviteStatsForDays(
  guildId: string,
  range: InviteStatsResponse["range"],
  startDay: string | null,
  endDay: string,
): Promise<InviteStatsResponse> {
  await ensureInviteStatsTables();
  const [rowsResult, totalsResult] = await Promise.all([
    pool.query<{
      invite_code: string;
      inviter_id: string | null;
      inviter_name: string | null;
      channel_id: string | null;
      discord_uses: number;
      attributed_joins: number;
      max_uses: number | null;
      expires_at: Date | null;
      active: boolean;
      last_synced_at: Date | null;
    }>(
      `SELECT i.invite_code, i.inviter_id, i.inviter_name, i.channel_id,
              i.discord_uses, i.max_uses, i.expires_at, i.active, i.last_synced_at,
              COALESCE(SUM(d.join_count), 0)::int AS attributed_joins
         FROM discord_invite_links i
         LEFT JOIN discord_invite_daily d
           ON d.guild_id = i.guild_id
          AND d.invite_code = i.invite_code
          AND ($2::text IS NULL OR d.day >= $2)
          AND d.day <= $3
        WHERE i.guild_id = $1
        GROUP BY i.guild_id, i.invite_code
        ORDER BY attributed_joins DESC, i.discord_uses DESC, i.invite_code ASC
        LIMIT ${MAX_INVITE_ROWS}`,
      [guildId, startDay, endDay],
    ),
    pool.query<{ attributed_joins: number; unknown_joins: number }>(
      `SELECT
          COALESCE(SUM(join_count) FILTER (WHERE invite_code <> ''), 0)::int AS attributed_joins,
          COALESCE(SUM(join_count) FILTER (WHERE invite_code = ''), 0)::int AS unknown_joins
         FROM discord_invite_daily
        WHERE guild_id = $1
          AND ($2::text IS NULL OR day >= $2)
          AND day <= $3`,
      [guildId, startDay, endDay],
    ),
  ]);

  return {
    range,
    startDay,
    endDay,
    totals: {
      attributedJoins: Number(totalsResult.rows[0]?.attributed_joins ?? 0),
      unknownJoins: Number(totalsResult.rows[0]?.unknown_joins ?? 0),
    },
    rows: rowsResult.rows.map((row) => ({
      code: row.invite_code,
      url: `https://discord.gg/${encodeURIComponent(row.invite_code)}`,
      inviterId: row.inviter_id,
      inviterName: row.inviter_name,
      channelId: row.channel_id,
      totalDiscordUses: Number(row.discord_uses),
      attributedJoins: Number(row.attributed_joins),
      maxUses: row.max_uses === null ? null : Number(row.max_uses),
      expiresAt: row.expires_at?.toISOString() ?? null,
      active: row.active,
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    })),
  };
}

function dayParts(timestamp: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function getDueInviteReportPeriod(
  config: InviteTrackingConfig,
  timestamp = Date.now(),
): InviteReportPeriod | null {
  if (!config.enabled || !config.reportEnabled) return null;
  const parts = dayParts(timestamp, config.reportTimeZone);
  const [targetHour, targetMinute] = config.reportTime.split(":").map(Number);
  const currentHour = Number(parts.hour);
  const currentMinute = Number(parts.minute);
  if (currentHour < targetHour! || (currentHour === targetHour && currentMinute < targetMinute!)) return null;

  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const currentWeekday = weekdays[parts.weekday ?? ""] ?? 0;
  if (config.reportFrequency === "weekly" && currentWeekday !== config.reportWeekday) return null;

  const currentDay = `${parts.year}-${parts.month}-${parts.day}`;
  const endDay = shiftDay(currentDay, -1);
  const startDay = shiftDay(endDay, config.reportFrequency === "weekly" ? -6 : 0);
  return {
    startDay,
    endDay,
    reportKey: `${config.reportFrequency}:${endDay}`,
    frequency: config.reportFrequency,
  };
}

function safeEmbedText(value: string | null | undefined, maxLength: number): string {
  return (value ?? "Necunoscut")
    .replace(/@/g, "@\u200b")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function resolveInviteCodesForJoinBatch(
  joinCount: number,
  inviteUseDeltas: Map<string, number>,
): Array<string | null> {
  const changedInvites = [...inviteUseDeltas.entries()].filter(([, uses]) => uses > 0);
  if (
    joinCount > 0
    && changedInvites.length === 1
    && changedInvites[0]![1] === joinCount
  ) {
    return Array.from({ length: joinCount }, () => changedInvites[0]![0]);
  }
  return Array.from({ length: Math.max(0, joinCount) }, () => null);
}

export function buildInviteJoinLogEmbed(
  guildName: string,
  data: {
    memberId: string;
    inviteCode: string | null;
    inviterId: string | null;
    inviterName: string | null;
    attributionAmbiguous: boolean;
  },
): EmbedBuilder {
  const invitedBy = data.inviterId
    ? `<@${data.inviterId}>`
    : data.inviterName
      ? safeEmbedText(data.inviterName, 100)
      : data.attributionAmbiguous
        ? "Necunoscut — au intrat mai mulți membri simultan."
        : "Necunoscut — Discord nu a confirmat codul folosit.";
  const inviteCode = data.inviteCode
    ? `[\`${safeEmbedText(data.inviteCode, 80)}\`](<https://discord.gg/${encodeURIComponent(data.inviteCode)}>)`
    : "Necunoscut";

  return new EmbedBuilder()
    .setColor(data.inviterId ? 0x22c55e : 0xf59e0b)
    .setAuthor({ name: `ORACOLUL CENUȘII · INVITE LOG · ${safeEmbedText(guildName, 100)}` })
    .setTitle("A intrat un membru nou")
    .setDescription(`**Membru:** <@${data.memberId}>\n**Invitat de:** ${invitedBy}\n**Codul invitației:** ${inviteCode}`)
    .setTimestamp(new Date());
}

async function publishInviteJoinLogs(
  guild: Guild,
  members: GuildMember[],
  inviteUseDeltas: Map<string, number>,
  inviteRows: InviteSnapshotRow[],
): Promise<void> {
  const config = activeConfigs.get(guild.id);
  if (!config?.enabled || !config.joinLogChannelId || members.length === 0) return;

  try {
    const channel = await guild.channels.fetch(config.joinLogChannelId).catch(() => null);
    if (!(channel instanceof TextChannel) || channel.guildId !== guild.id) {
      throw new Error(`Canalul jurnalului invitațiilor nu mai este disponibil: ${config.joinLogChannelId}`);
    }
    const codes = resolveInviteCodesForJoinBatch(members.length, inviteUseDeltas);
    const inviteByCode = new Map(inviteRows.map((row) => [row.code, row]));
    const attributionAmbiguous = inviteUseDeltas.size > 1
      || (inviteUseDeltas.size === 1 && [...inviteUseDeltas.values()][0] !== members.length);
    for (const [index, member] of members.entries()) {
      const inviteCode = codes[index] ?? null;
      const invite = inviteCode ? inviteByCode.get(inviteCode) : null;
      await channel.send({
        embeds: [buildInviteJoinLogEmbed(guild.name, {
          memberId: member.id,
          inviteCode,
          inviterId: invite?.inviterId ?? null,
          inviterName: invite?.inviterName ?? null,
          attributionAmbiguous,
        })],
        allowedMentions: { parse: [] },
      });
    }
  } catch (error) {
    logger.warn({ error, guildId: guild.id, channelId: config.joinLogChannelId }, "Could not publish invite join log");
  }
}

export function buildInviteStatsEmbed(
  guildName: string,
  period: InviteReportPeriod,
  stats: InviteStatsResponse,
  topLimit: number,
): EmbedBuilder {
  const periodLabel = period.frequency === "daily"
    ? period.endDay
    : `${period.startDay} – ${period.endDay}`;
  const topRows = stats.rows
    .filter((row) => row.attributedJoins > 0)
    .slice(0, topLimit);
  const lines = topRows.length > 0
    ? topRows.map((row, index) => {
      const inviter = safeEmbedText(row.inviterName, 70);
      const code = safeEmbedText(row.code, 40);
      return `${index + 1}. [${code}](<${row.url}>) — **${row.attributedJoins.toLocaleString("ro-RO")}** intrări · ${inviter}`;
    })
    : ["Nu au fost înregistrate intrări atribuite în această perioadă."];

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setAuthor({ name: "ORACOLUL CENUȘII · INVITE INSIGHTS" })
    .setTitle(`🔗 Invitații · ${safeEmbedText(guildName, 150)}`)
    .setDescription(lines.join("\n").slice(0, 3_800))
    .addFields(
      { name: "Perioadă", value: periodLabel, inline: true },
      { name: "Intrări atribuite", value: stats.totals.attributedJoins.toLocaleString("ro-RO"), inline: true },
      { name: "Neatribuite", value: stats.totals.unknownJoins.toLocaleString("ro-RO"), inline: true },
    )
    .setFooter({ text: "Atribuirea este disponibilă numai cât timp botul poate citi invitațiile și primește evenimentele de membri." })
    .setTimestamp(new Date(`${period.endDay}T12:00:00.000Z`));
}

async function claimReport(guildId: string, reportKey: string, token: string): Promise<boolean> {
  const result = await pool.query<{ claim_token: string }>(
    `INSERT INTO discord_invite_reports
       (guild_id, report_key, claim_token, claim_expires_at, updated_at)
     VALUES ($1, $2, $3, now() + ($4::int * interval '1 millisecond'), now())
     ON CONFLICT (guild_id, report_key) DO UPDATE SET
       claim_token = EXCLUDED.claim_token,
       claim_expires_at = EXCLUDED.claim_expires_at,
       updated_at = now()
     WHERE discord_invite_reports.message_id IS NULL
       AND (discord_invite_reports.claim_expires_at IS NULL OR discord_invite_reports.claim_expires_at < now())
     RETURNING claim_token`,
    [guildId, reportKey, token, INVITE_REPORT_CLAIM_MS],
  );
  return result.rows[0]?.claim_token === token;
}

async function releaseReportClaim(guildId: string, reportKey: string, token: string): Promise<void> {
  await pool.query(
    `UPDATE discord_invite_reports
        SET claim_token = NULL, claim_expires_at = NULL, updated_at = now()
      WHERE guild_id = $1 AND report_key = $2 AND claim_token = $3 AND message_id IS NULL`,
    [guildId, reportKey, token],
  );
}

async function markReportSent(guildId: string, reportKey: string, token: string, messageId: string): Promise<void> {
  await pool.query(
    `UPDATE discord_invite_reports
        SET message_id = $4, reported_at = now(), claim_token = NULL,
            claim_expires_at = NULL, updated_at = now()
      WHERE guild_id = $1 AND report_key = $2 AND claim_token = $3`,
    [guildId, reportKey, token, messageId],
  );
}

export async function publishScheduledInviteStatsReport(client: Client, guildId: string, timestamp = Date.now()): Promise<boolean> {
  const config = activeConfigs.get(guildId) ?? await loadInviteTrackingConfig(guildId);
  const period = getDueInviteReportPeriod(config, timestamp);
  if (!period || !config.reportChannelId) return false;

  await ensureInviteStatsTables();
  const token = randomUUID();
  if (!await claimReport(guildId, period.reportKey, token)) return false;

  try {
    const fetchedChannel = await client.channels.fetch(config.reportChannelId).catch(() => null);
    if (!(fetchedChannel instanceof TextChannel) || fetchedChannel.guildId !== guildId) {
      throw new Error(`Canalul raportului de invitații nu este un canal text valid: ${config.reportChannelId}`);
    }
    const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new Error(`Serverul Discord nu este disponibil: ${guildId}`);

    const range: InviteStatsResponse["range"] = period.frequency === "daily" ? "7" : "7";
    const stats = await getInviteStatsForDays(guildId, range, period.startDay, period.endDay);
    const message = await fetchedChannel.send({
      embeds: [buildInviteStatsEmbed(guild.name, period, stats, config.reportTopLimit)],
      allowedMentions: { parse: [] },
    });
    await markReportSent(guildId, period.reportKey, token, message.id);
    logger.info(
      { guildId, channelId: fetchedChannel.id, reportKey: period.reportKey, messageId: message.id },
      "Published scheduled Discord invite statistics",
    );
    return true;
  } catch (error) {
    await releaseReportClaim(guildId, period.reportKey, token).catch((releaseError) =>
      logger.error({ releaseError, guildId, reportKey: period.reportKey }, "Could not release invite report claim"),
    );
    throw error;
  }
}

function startInviteStatsReportScheduler(client: Client, guildId: string): void {
  if (reportTimers.has(guildId)) return;
  const timer = setInterval(() => {
    void publishScheduledInviteStatsReport(client, guildId).catch((error) =>
      logger.warn({ error, guildId }, "Scheduled Discord invite report failed"),
    );
  }, REPORT_CHECK_INTERVAL_MS);
  timer.unref?.();
  reportTimers.set(guildId, timer);
}

export function stopInviteStatsReportScheduler(guildId: string): void {
  const timer = reportTimers.get(guildId);
  if (timer) clearInterval(timer);
  reportTimers.delete(guildId);
}

export async function applyInviteTrackingConfig(
  client: Client | null,
  guild: Guild | null,
  config: InviteTrackingConfig,
): Promise<void> {
  const guildId = guild?.id;
  if (!guildId) return;
  activeConfigs.set(guildId, config);
  const state = stateFor(guildId);
  if (!config.enabled) {
    if (state.flushTimer) clearTimeout(state.flushTimer);
    state.flushTimer = null;
    state.queuedMembers = [];
    state.usesByCode.clear();
    state.pendingUsesByCode.clear();
    state.snapshotReady = false;
    stopInviteStatsReportScheduler(guildId);
    return;
  }

  if (!state.snapshotReady) {
    try {
      await syncGuildInviteSnapshot(guild);
    } catch (error) {
      logger.warn({ error, guildId }, "Could not initialize Discord invite snapshot");
    }
  }
  if (client?.isReady() && config.reportEnabled) {
    startInviteStatsReportScheduler(client, guildId);
  } else {
    stopInviteStatsReportScheduler(guildId);
  }
}

export function stopInviteTracking(guildId: string): void {
  stopInviteStatsReportScheduler(guildId);
  const state = inviteStates.get(guildId);
  if (state?.flushTimer) clearTimeout(state.flushTimer);
  inviteStates.delete(guildId);
  activeConfigs.delete(guildId);
}