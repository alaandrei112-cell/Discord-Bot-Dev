import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { pool } from "@workspace/db";
import {
  ensureBotStateTable,
  upsertPlayer,
} from "./db";
import { grantAdminPlayerBoost, grantGuildBoost } from "./status-effects";
import { logger } from "../lib/logger";
import { isTicketCategoryParentId } from "./ticket-categories";

const CONFIG_PREFIX = "tribute:config:";
const EVENT_PREFIX = "tribute:event:";
const DEFAULT_INTERVAL_MINUTES = 24 * 60;
const MIN_INTERVAL_MINUTES = DEFAULT_INTERVAL_MINUTES;
const MAX_INTERVAL_MINUTES = DEFAULT_INTERVAL_MINUTES;
export const TRIBUTE_WINDOW_MINUTES = 24 * 60;
const TRIBUTE_WINDOW_MS = TRIBUTE_WINDOW_MINUTES * 60_000;
const WINNER_BUFF_MS = 30 * 60_000;
const FAILURE_DEBUFF_MS = 20 * 60_000;
const MIN_TARGET = 100;
const MAX_TARGET = 10_000;

function stateKey(prefix: string, guildId: string): string {
  return `${prefix}${guildId}`;
}

function publicAssetUrl(file: string): string | null {
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
    .split(",")[0]?.trim();
  return domain ? `https://${domain}/api/assets/${file}` : null;
}

const TRIBUTE_IMAGE = publicAssetUrl("tributul_regatului.png");

export interface TributeConfig {
  guildId: string;
  channelId: string;
  intervalMinutes: number;
  enabled: boolean;
}

export interface TributeContributor {
  username: string;
  amount: number;
}

export interface TributeEvent {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  target: number;
  raised: number;
  openedAt: number;
  closesAt: number;
  status: "open" | "claimed" | "failed";
  winnerId?: string;
  winnerName?: string;
  contributors: Record<string, TributeContributor>;
}

type ContributionResult =
  | { status: "accepted"; event: TributeEvent; completed: boolean }
  | { status: "closed" | "insufficient" | "invalid" };

const guildLocks = new Map<string, Promise<unknown>>();
const tributeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pausedGuilds = new Set<string>();

export function setTributeGamePaused(guildId: string, paused: boolean): void {
  if (paused) pausedGuilds.add(guildId);
  else pausedGuilds.delete(guildId);
}

async function withGuildLock<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
  const previous = guildLocks.get(guildId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  guildLocks.set(guildId, current);
  try {
    return await current;
  } finally {
    if (guildLocks.get(guildId) === current) guildLocks.delete(guildId);
  }
}

async function readState<T>(key: string): Promise<T | null> {
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

async function writeState(key: string, value: unknown): Promise<void> {
  await ensureBotStateTable();
  await pool.query(
    `INSERT INTO bot_state (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getTributeConfig(guildId: string): Promise<TributeConfig | null> {
  const stored = await readState<TributeConfig>(stateKey(CONFIG_PREFIX, guildId));
  if (!stored?.channelId) return null;
  return {
    guildId,
    channelId: stored.channelId,
    intervalMinutes: Math.max(
      MIN_INTERVAL_MINUTES,
      Math.min(MAX_INTERVAL_MINUTES, Math.floor(stored.intervalMinutes || DEFAULT_INTERVAL_MINUTES)),
    ),
    enabled: stored.enabled !== false,
  };
}

export async function saveTributeConfig(
  guildId: string,
  channelId: string,
  intervalMinutes = DEFAULT_INTERVAL_MINUTES,
): Promise<TributeConfig> {
  const config: TributeConfig = {
    guildId,
    channelId,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    enabled: true,
  };
  await writeState(stateKey(CONFIG_PREFIX, guildId), config);
  return config;
}

function randomTributeTarget(): number {
  return MIN_TARGET + Math.floor(Math.random() * (MAX_TARGET - MIN_TARGET + 1));
}

function progressBar(raised: number, target: number): string {
  const ratio = target > 0 ? Math.max(0, Math.min(1, raised / target)) : 0;
  const filled = Math.round(ratio * 10);
  return "🟥".repeat(filled) + "⬛".repeat(10 - filled);
}

function contributorLines(event: TributeEvent): string {
  const entries = Object.entries(event.contributors)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 8);
  if (entries.length === 0) return "*Nimeni nu a oferit încă.*";
  const lines = entries.map(([id, c]) => `• <@${id}> — **${c.amount.toLocaleString("ro-RO")}** Oboli`);
  const remaining = Object.keys(event.contributors).length - entries.length;
  if (remaining > 0) lines.push(`*și încă ${remaining} contribuitor(i)…*`);
  return lines.join("\n");
}

export function buildTributeEmbed(event: TributeEvent): EmbedBuilder {
  const remaining = Math.max(0, event.target - event.raised);
  const embed = new EmbedBuilder()
    .setColor(event.status === "failed" ? 0x4b1020 : event.status === "claimed" ? 0xd4af37 : 0x8f162e)
    .setTitle(event.status === "failed" ? "🩸 Tributul a fost refuzat" : "🩸 Tributul Regatului")
    .setDescription(
      event.status === "open"
        ? `Regatul cere **${event.target.toLocaleString("ro-RO")} Oboli**.\n` +
          "Contribuiți împreună înainte ca răbdarea tronului să se sfârșească."
        : event.status === "claimed"
          ? `Regatul a primit tributul. **${event.winnerName ?? "Un credincios"}** a completat ultima parte a ofrandei.`
          : "Nimeni nu a hrănit tronul. Umbrele au coborât peste acest server.",
    )
    .addFields(
      {
        name: "Progresul regatului",
        value: `${progressBar(event.raised, event.target)}\n**${event.raised.toLocaleString("ro-RO")} / ${event.target.toLocaleString("ro-RO")} Oboli**`,
        inline: false,
      },
      {
        name: event.status === "open" ? "Mai lipsesc" : "Rezultat",
        value: event.status === "open"
          ? `**${remaining.toLocaleString("ro-RO")} Oboli**\nExpiră <t:${Math.floor(event.closesAt / 1000)}:R>`
          : event.status === "claimed"
            ? "✨ Contribuitorii primesc reputație.\n⚡ Cel care a completat tributul primește Favorul Regelui."
            : "🌑 **Mânia Regelui**: -15% XP și Oboli timp de 20 de minute.",
        inline: true,
      },
      {
        name: "Ofrande",
        value: contributorLines(event),
        inline: true,
      },
    )
    .setFooter({ text: "Tribut comun pentru acest server • cheile și cuferele nu sunt afectate" })
    .setTimestamp(new Date(event.openedAt));
  if (TRIBUTE_IMAGE) embed.setImage(TRIBUTE_IMAGE);
  return embed;
}

export function tributeContributionModal(eventId: string): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Câți Oboli oferi?")
    .setPlaceholder("Introdu o sumă între 1 și suma rămasă")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(6);
  return new ModalBuilder()
    .setCustomId(`tribute_submit_${eventId}`)
    .setTitle("Ofrandă pentru Regat")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

function tributeRow(eventId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tribute_contribute_${eventId}`)
      .setLabel(disabled ? "Tribut încheiat" : "Oferă Oboli")
      .setEmoji("🩸")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function editTributeMessage(client: Client, event: TributeEvent): Promise<void> {
  const channel = await client.channels.fetch(event.channelId).catch(() => null);
  if (!(channel instanceof TextChannel)) return;
  const message = await channel.messages.fetch(event.messageId).catch(() => null);
  await message?.edit({
    embeds: [buildTributeEmbed(event)],
    components: [tributeRow(event.id, event.status !== "open")],
  }).catch(() => null);
}

export async function fireTribute(client: Client, guildId: string): Promise<TributeEvent | null> {
  if (pausedGuilds.has(guildId)) return null;
  return withGuildLock(guildId, async () => {
    if (pausedGuilds.has(guildId)) return null;
    const config = await getTributeConfig(guildId);
    if (!config?.enabled) return null;
    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (!(channel instanceof TextChannel)) {
      logger.warn({ guildId, channelId: config.channelId }, "Tribute channel is not a text channel");
      return null;
    }
    if (isTicketCategoryParentId(channel.parentId, channel.guildId)) {
      logger.warn(
        { guildId, channelId: channel.id, parentId: channel.parentId },
        "Tribute channel is a ticket channel — automated post skipped",
      );
      return null;
    }

    const previous = await readState<TributeEvent>(stateKey(EVENT_PREFIX, guildId));
    if (previous?.status === "open" && previous.closesAt > Date.now()) return previous;

    const now = Date.now();
    const event: TributeEvent = {
      id: `tribut_${guildId}_${now}`,
      guildId,
      channelId: channel.id,
      messageId: "",
      target: randomTributeTarget(),
      raised: 0,
      openedAt: now,
      closesAt: now + TRIBUTE_WINDOW_MS,
      status: "open",
      contributors: {},
    };
    const message = await channel.send({
      embeds: [buildTributeEmbed(event)],
      components: [tributeRow(event.id)],
    });
    event.messageId = message.id;
    await writeState(stateKey(EVENT_PREFIX, guildId), event);
    setTimeout(() => {
      if (!pausedGuilds.has(guildId)) void settleTribute(client, guildId, event.id);
    }, TRIBUTE_WINDOW_MS + 500);
    logger.info({ guildId, target: event.target, messageId: event.messageId }, "Tributul Regatului fired");
    return event;
  });
}

async function settleTribute(client: Client, guildId: string, eventId: string): Promise<void> {
  if (pausedGuilds.has(guildId)) return;
  const failed = await withGuildLock(guildId, async () => {
    if (pausedGuilds.has(guildId)) return null;
    const event = await readState<TributeEvent>(stateKey(EVENT_PREFIX, guildId));
    if (!event || event.id !== eventId || event.status !== "open" || event.closesAt > Date.now()) return null;
    event.status = "failed";
    await writeState(stateKey(EVENT_PREFIX, guildId), event);
    return event;
  });
  if (!failed) return;
  grantGuildBoost(guildId, 0.85, 0.85, FAILURE_DEBUFF_MS);
  await editTributeMessage(client, failed);
  logger.info({ guildId, target: failed.target, raised: failed.raised }, "Tributul Regatului failed — guild debuff applied");
}

async function acceptContribution(
  guildId: string,
  eventId: string,
  discordId: string,
  username: string,
  amount: number,
): Promise<ContributionResult> {
  await ensureBotStateTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ value: string }>(
      "SELECT value FROM bot_state WHERE key = $1 FOR UPDATE",
      [stateKey(EVENT_PREFIX, guildId)],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return { status: "closed" };
    }
    const event = JSON.parse(result.rows[0].value) as TributeEvent;
    const remaining = event.target - event.raised;
    if (event.id !== eventId || event.status !== "open" || event.closesAt <= Date.now()) {
      await client.query("ROLLBACK");
      return { status: "closed" };
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > remaining) {
      await client.query("ROLLBACK");
      return { status: "invalid" };
    }

    const paid = await client.query(
      `UPDATE players SET gold = gold - $1
       WHERE discord_id = $2 AND guild_id = $3 AND gold >= $1`,
      [amount, discordId, guildId],
    );
    if ((paid.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { status: "insufficient" };
    }

    const previous = event.contributors[discordId];
    event.contributors[discordId] = {
      username,
      amount: (previous?.amount ?? 0) + amount,
    };
    event.raised += amount;
    const completed = event.raised >= event.target;
    if (completed) {
      event.status = "claimed";
      event.winnerId = discordId;
      event.winnerName = username;

      for (const contributorId of Object.keys(event.contributors)) {
        await client.query(
          `UPDATE players SET reputation = reputation + $1
           WHERE discord_id = $2 AND guild_id = $3`,
          [10, contributorId, guildId],
        );
      }
      await client.query(
        `UPDATE players SET reputation = reputation + $1, xp = xp + $2
         WHERE discord_id = $3 AND guild_id = $4`,
        [50, 500, discordId, guildId],
      );
    }

    await client.query(
      `UPDATE bot_state SET value = $2, updated_at = now() WHERE key = $1`,
      [stateKey(EVENT_PREFIX, guildId), JSON.stringify(event)],
    );
    await client.query("COMMIT");
    return { status: "accepted", event, completed };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => null);
    throw err;
  } finally {
    client.release();
  }
}

export async function handleTributeContribution(
  client: Client,
  guildId: string,
  eventId: string,
  discordId: string,
  username: string,
  amount: number,
): Promise<ContributionResult> {
  const result = await withGuildLock(guildId, () =>
    acceptContribution(guildId, eventId, discordId, username, amount),
  );
  if (result.status === "accepted") {
    if (result.completed) {
      grantAdminPlayerBoost(discordId, 1.5, 1.5, WINNER_BUFF_MS);
      await editTributeMessage(client, result.event);
      logger.info({ guildId, discordId, eventId }, "Tributul Regatului completed — winner buff applied");
    } else {
      await editTributeMessage(client, result.event);
    }
  }
  return result;
}

export async function handleTributeButton(
  client: Client,
  guildId: string,
  eventId: string,
  discordId: string,
  username: string,
): Promise<{ status: "open" | "closed" | "already"; modal?: ModalBuilder }> {
  const event = await readState<TributeEvent>(stateKey(EVENT_PREFIX, guildId));
  if (!event || event.id !== eventId || event.status !== "open" || event.closesAt <= Date.now()) {
    return { status: "closed" };
  }
  if (event.contributors[discordId]) {
    // Repeat contributions are allowed; this branch intentionally only avoids
    // a misleading "first contribution" message in callers.
    return { status: "open", modal: tributeContributionModal(eventId) };
  }
  return { status: "open", modal: tributeContributionModal(eventId) };
}

export function stopTributeScheduler(guildId: string): void {
  const timer = tributeTimers.get(guildId);
  if (timer) clearTimeout(timer);
  tributeTimers.delete(guildId);
}

function scheduleTribute(client: Client, guildId: string, delayMs: number): void {
  stopTributeScheduler(guildId);
  const timer = setTimeout(async () => {
    tributeTimers.delete(guildId);
    if (pausedGuilds.has(guildId)) return;
    await fireTribute(client, guildId).catch((err) =>
      logger.warn({ err, guildId }, "Failed to fire Tributul Regatului"),
    );
    const config = await getTributeConfig(guildId).catch(() => null);
    if (config?.enabled) {
      // The configured interval is a cooldown after the 24-hour open window.
      scheduleTribute(client, guildId, TRIBUTE_WINDOW_MS + config.intervalMinutes * 60_000);
    }
  }, Math.max(1_000, delayMs));
  timer.unref?.();
  tributeTimers.set(guildId, timer);
}

export async function startTributeScheduler(client: Client, guildId: string): Promise<void> {
  if (pausedGuilds.has(guildId)) return;
  const config = await getTributeConfig(guildId).catch(() => null);
  if (!config?.enabled) {
    stopTributeScheduler(guildId);
    return;
  }
  const active = await readState<TributeEvent>(stateKey(EVENT_PREFIX, guildId));
  if (active?.status === "open" && active.closesAt > Date.now()) {
    setTimeout(() => {
      if (!pausedGuilds.has(guildId)) void settleTribute(client, guildId, active.id);
    }, Math.max(1_000, active.closesAt - Date.now() + 500));
  }
  const nextAt = active
    ? active.openedAt + TRIBUTE_WINDOW_MS + config.intervalMinutes * 60_000
    : Date.now() + TRIBUTE_WINDOW_MS + config.intervalMinutes * 60_000;
  scheduleTribute(client, guildId, Math.max(1_000, nextAt - Date.now()));
}

export async function restartTributeScheduler(client: Client, guildId: string): Promise<void> {
  stopTributeScheduler(guildId);
  await startTributeScheduler(client, guildId);
}

export function tributeIntervalBounds(): { min: number; max: number; default: number } {
  return { min: MIN_INTERVAL_MINUTES, max: MAX_INTERVAL_MINUTES, default: DEFAULT_INTERVAL_MINUTES };
}

export async function ensureTributePlayer(guildId: string, discordId: string, username: string): Promise<void> {
  await upsertPlayer(discordId, guildId, username);
}

export async function getTributeStatus(guildId: string): Promise<TributeEvent | null> {
  return readState<TributeEvent>(stateKey(EVENT_PREFIX, guildId));
}