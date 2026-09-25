import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  type ButtonInteraction,
  type Client,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import {
  castOracleCouncilVote,
  closeOracleCouncil,
  loadOracleCouncil,
  loadOracleCouncilDecreeEffect,
  recordOracleInteraction,
  saveOracleCouncilDecreeEffect,
  saveOracleCouncil,
  grantCouncilVoterReputationOnce,
  type OracleCouncilOption,
  type OracleCouncilRecord,
} from "./db";
import { grantGuildBoost, restoreGuildBoost } from "./status-effects";
import { isTicketCategoryParentId } from "./ticket-categories";
import { isOracleEnabled } from "./oracle";
import { getChannel as getConfiguredChannel } from "./channel-config";

const MINUTE = 60 * 1000;
const COUNCIL_ENABLED = process.env.ORACLE_COUNCIL_ENABLED !== "false";
const COUNCIL_FIRST_DELAY_MS = envInt("ORACLE_COUNCIL_FIRST_DELAY_MIN", 30, 24 * 60) * MINUTE;
const COUNCIL_INTERVAL_MS = envInt("ORACLE_COUNCIL_INTERVAL_HOURS", 6, 168) * 60 * MINUTE;
const COUNCIL_VOTING_WINDOW_MS = envInt("ORACLE_COUNCIL_VOTING_MINUTES", 20, 180) * MINUTE;
const COUNCIL_DECREE_DURATION_MS = 6 * 60 * MINUTE;
export const COUNCIL_MESSAGE_RETENTION_MS = 20 * MINUTE;

function envInt(name: string, fallback: number, max: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

const COUNCIL_PROPOSALS: Array<{ question: string; options: OracleCouncilOption[] }> = [
  {
    question: "Ce parte a Regatului să fie binecuvântată în următoarea veghe?",
    options: [
      { id: "cufere", label: "Cuferele", emoji: "🪙", decree: "Cuferele vor purta noroc în următoarea veghe." },
      { id: "lupta", label: "Lupta", emoji: "⚔️", decree: "Lupta va fi în centrul următoarei veghe." },
      { id: "reputatia", label: "Reputația", emoji: "🏅", decree: "Faptele vitejilor vor fi cântărite cu mai multă grijă." },
    ],
  },
  {
    question: "Ce primejdie să cheme Oracolul din adâncul umbrelor?",
    options: [
      { id: "furtuna", label: "Furtuna", emoji: "🌩️", decree: "Furtuna va bântui ținutul, dar va lăsa în urmă comori." },
      { id: "hoarda", label: "Hoarda", emoji: "👹", decree: "Hoarda va ieși din neguri și va pune curajul la încercare." },
      { id: "dragonul", label: "Dragonul", emoji: "🐉", decree: "Numele Dragonului va fi rostit din nou în cronicile Regatului." },
    ],
  },
  {
    question: "Ce lege să urmeze Regatul Cenușii până la următoarea lună?",
    options: [
      { id: "aur", label: "Legea Aurului", emoji: "🪙", decree: "Aurul va fi strâns cu răbdare, nu smuls din mâna sorții." },
      { id: "gloria", label: "Legea Gloriei", emoji: "👑", decree: "Gloria va aparține celor ce nu fug din fața întunericului." },
      { id: "taine", label: "Legea Tainelor", emoji: "🔮", decree: "Tainele vechi vor fi cercetate înainte ca focul să se stingă." },
    ],
  },
];

interface CouncilRuntime {
  token: symbol;
  isStopped: () => boolean;
  schedulerTimer?: ReturnType<typeof setTimeout>;
  closeTimer?: ReturnType<typeof setTimeout>;
}

const councilRuntimes = new Map<string, CouncilRuntime>();

function isRuntimeActive(guildId: string, token: symbol): boolean {
  const runtime = councilRuntimes.get(guildId);
  return runtime?.token === token && !runtime.isStopped();
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function optionVoteCount(council: OracleCouncilRecord, optionId: string): number {
  return Object.values(council.votes).filter((vote) => vote === optionId).length;
}

export function councilWinner(council: OracleCouncilRecord): OracleCouncilOption | null {
  const counts = council.options.map((option) => ({ option, count: optionVoteCount(council, option.id) }));
  const max = Math.max(...counts.map((entry) => entry.count), 0);
  if (max === 0) return null;
  const winners = counts.filter((entry) => entry.count === max);
  return winners.length === 1 ? winners[0]!.option : null;
}

export type CouncilDecreeEffect = {
  xpMult: number;
  goldMult: number;
  voterReputation: number;
  durationMs: number;
  summary: string;
};

export function councilDecreeEffect(optionId: string): CouncilDecreeEffect {
  const durationMs = COUNCIL_DECREE_DURATION_MS;
  switch (optionId) {
    case "cufere":
      return { xpMult: 1.1, goldMult: 1.25, voterReputation: 0, durationMs, summary: "Cuferele și lupta aduc +25% Oboli și +10% XP." };
    case "lupta":
      return { xpMult: 1.25, goldMult: 1, voterReputation: 0, durationMs, summary: "Luptele aduc +25% XP timp de 6 ore." };
    case "reputatia":
      return { xpMult: 1, goldMult: 1, voterReputation: 10, durationMs, summary: "Fiecare votant primește +10 Reputație." };
    case "furtuna":
      return { xpMult: 1.1, goldMult: 1.1, voterReputation: 0, durationMs, summary: "Furtuna aduce +10% XP și +10% Oboli timp de 6 ore." };
    case "hoarda":
      return { xpMult: 1.2, goldMult: 1.1, voterReputation: 0, durationMs, summary: "Hoarda aduce +20% XP și +10% Oboli timp de 6 ore." };
    case "dragonul":
      return { xpMult: 1.3, goldMult: 1.15, voterReputation: 0, durationMs, summary: "Dragonul aduce +30% XP și +15% Oboli timp de 6 ore." };
    case "aur":
      return { xpMult: 1, goldMult: 1.25, voterReputation: 0, durationMs, summary: "Toți jucătorii primesc +25% Oboli timp de 6 ore." };
    case "gloria":
      return { xpMult: 1.25, goldMult: 1, voterReputation: 0, durationMs, summary: "Toți jucătorii primesc +25% XP timp de 6 ore." };
    case "taine":
      return { xpMult: 1.15, goldMult: 1.15, voterReputation: 0, durationMs, summary: "Tainele aduc +15% XP și +15% Oboli timp de 6 ore." };
    default:
      return { xpMult: 1, goldMult: 1, voterReputation: 0, durationMs, summary: "Cenușa nu a lăsat niciun efect cunoscut." };
  }
}

export async function applyCouncilDecree(council: OracleCouncilRecord, winner: OracleCouncilOption): Promise<string> {
  const effect = councilDecreeEffect(winner.id);
  const intendedExpiresAt = council.closesAt + effect.durationMs;
  const remainingDurationMs = Math.max(0, intendedExpiresAt - Date.now());
  if (remainingDurationMs > 0) {
    // Recovery uses the original absolute expiry, so a restart cannot extend
    // a six-hour decree beyond the window chosen by the vote.
    const boost = grantGuildBoost(
      council.guildId,
      effect.xpMult,
      effect.goldMult,
      remainingDurationMs,
    );
    await saveOracleCouncilDecreeEffect({
      guildId: council.guildId,
      xpMult: boost.xpMult,
      goldMult: boost.goldMult,
      expiresAt: intendedExpiresAt,
    });
  }
  if (effect.voterReputation > 0) {
    await grantCouncilVoterReputationOnce(
      council.guildId,
      council.id,
      Object.keys(council.votes),
      effect.voterReputation,
    );
  }
  return effect.summary;
}

/** Reinstalls the still-active council law after a process restart. */
export async function rehydrateCouncilDecree(guildId: string): Promise<boolean> {
  const persisted = await loadOracleCouncilDecreeEffect(guildId);
  if (!persisted) return false;
  return restoreGuildBoost(guildId, persisted.xpMult, persisted.goldMult, persisted.expiresAt) !== null;
}

function councilEmbed(council: OracleCouncilRecord): EmbedBuilder {
  const closed = council.status === "closed";
  const lines = council.options.map((option) => {
    const count = optionVoteCount(council, option.id);
    return `${option.emoji} **${option.label}** — ${count} ${count === 1 ? "glas" : "glasuri"}`;
  });
  const winner = closed ? councilWinner(council) : null;
  const description = closed
    ? winner
      ? `**Hotărârea Consiliului:** ${winner.emoji} **${winner.label}**\n${winner.decree}`
      : "Votul s-a încheiat fără o hotărâre limpede. Umbrele rămân împărțite."
    : "Alege o singură cale. Fiecare suflet poate lăsa un singur glas.";

  return new EmbedBuilder()
    .setColor(closed ? 0x4b3b57 : 0x24162e)
    .setTitle(closed ? "📜 Hotărârea Consiliului Umbrelor" : "🏰 Consiliul Umbrelor")
    .setDescription(`*${council.question}*\n\n${description}`)
    .addFields({ name: "Glasurile Regatului", value: lines.join("\n"), inline: false })
    .setFooter({
      text: closed
        ? "Cronicarul a închis urnele. Hotărârea rămâne în memoria Cenușii."
        : "Urnele se închid în curând. Nu lăsa soarta să decidă fără tine.",
    })
    .setTimestamp();
}

function councilButtons(council: OracleCouncilRecord): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    council.options.map((option) =>
      new ButtonBuilder()
        .setCustomId(`council_vote_${council.id}_${option.id}`)
        .setLabel(option.label)
        .setEmoji(option.emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(council.status === "closed"),
    ),
  );
}

async function getChannel(client: Client, channelId: string): Promise<TextChannel | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || isTicketCategoryParentId(channel.parentId, channel.guildId)) return null;
  return channel;
}

async function deleteCouncilMessages(client: Client, council: OracleCouncilRecord): Promise<void> {
  const originalChannel = await getChannel(client, council.channelId);
  const resultChannel = council.resultChannelId && council.resultChannelId !== council.channelId
    ? await getChannel(client, council.resultChannelId)
    : originalChannel;
  await Promise.all(
    [
      { channel: originalChannel, messageId: council.messageId },
      { channel: resultChannel, messageId: council.resultMessageId },
    ].map(async ({ channel, messageId }) => {
      if (!channel || !messageId) return;
      const message = await channel.messages.fetch(messageId).catch(() => null);
      await message?.delete().catch(() => null);
    }),
  );
}

function scheduleCouncilMessageDeletion(client: Client, council: OracleCouncilRecord): void {
  const cleanupAt = council.cleanupAt ?? Date.now() + COUNCIL_MESSAGE_RETENTION_MS;
  const timer = setTimeout(() => {
    void deleteCouncilMessages(client, council).catch((err) =>
      logger.warn({ err, guildId: council.guildId, councilId: council.id }, "Could not delete closed council messages"),
    );
  }, Math.max(0, cleanupAt - Date.now()));
  timer.unref?.();
}

export async function finalizeCouncil(
  client: Client,
  guildId: string,
  councilId: string,
  token?: symbol,
): Promise<void> {
  if (token && !isRuntimeActive(guildId, token)) return;
  let closed = await closeOracleCouncil(guildId, councilId);
  if (!closed) {
    const existing = await loadOracleCouncil(guildId);
    if (!existing || existing.id !== councilId || existing.status !== "closed" || existing.resolvedAt) return;
    closed = existing;
  }
  if (token && !isRuntimeActive(guildId, token)) return;
  const winner = closed.winnerId
    ? closed.options.find((option) => option.id === closed.winnerId) ?? null
    : councilWinner(closed);
  if (!closed.winnerId) closed.winnerId = winner?.id;

  const channel = await getChannel(client, closed.channelId);
  if (channel) {
    const message = await channel.messages.fetch(closed.messageId).catch(() => null);
    await message?.edit({ embeds: [councilEmbed(closed)], components: [councilButtons(closed)] }).catch(() => null);
  }

  if (!closed.effectAppliedAt) {
    closed.effectSummary = winner
      ? await applyCouncilDecree(closed, winner)
      : "Nu s-a aplicat nicio lege deoarece votul nu a avut un câștigător unic.";
    closed.effectAppliedAt = Date.now();
    await saveOracleCouncil(closed);
  }

  if (!closed.resultMessageId) {
    const configuredResultChannelId =
      getConfiguredChannel("council", guildId) ?? getConfiguredChannel("main", guildId);
    const configuredChannel = configuredResultChannelId
      ? await getChannel(client, configuredResultChannelId)
      : null;
    const resultChannel = configuredChannel ?? channel;
    if (!resultChannel) {
      throw new Error(`No valid channel available to publish council ${councilId}`);
    }
    const resultMessage = winner
      ? await resultChannel.send({
        content: `📜 **Hotărârea Consiliului Umbrelor:** ${winner.emoji} **${winner.label}**\n${winner.decree}\n\n✨ **Efectul legii:** ${closed.effectSummary}`,
      })
      : await resultChannel.send({
        content: "📜 **Consiliul Umbrelor s-a încheiat fără hotărâre.** Glasurile au fost împărțite, iar Cenușa păstrează tăcerea. Nu s-a aplicat nicio recompensă sau lege.",
      });
    if (!resultMessage?.id) {
      throw new Error(`Council ${councilId} result publication returned no message`);
    }
    closed.resultMessageId = resultMessage.id;
    closed.resultChannelId = resultChannel.id;
  }
  closed.resolvedAt = Date.now();
  closed.cleanupAt = Date.now() + COUNCIL_MESSAGE_RETENTION_MS;
  await saveOracleCouncil(closed);
  scheduleCouncilMessageDeletion(client, closed);
  logger.info({ guildId, councilId, winnerId: winner?.id ?? null }, "Oracle council closed");
}

function scheduleCouncilClose(client: Client, council: OracleCouncilRecord, token: symbol): void {
  const runtime = councilRuntimes.get(council.guildId);
  if (!runtime || runtime.token !== token) return;
  if (runtime.closeTimer) clearTimeout(runtime.closeTimer);
  const delay = Math.max(0, council.closesAt - Date.now());
  runtime.closeTimer = setTimeout(() => {
    void finalizeCouncil(client, council.guildId, council.id, token);
  }, delay);
  runtime.closeTimer.unref?.();
}

async function openCouncil(client: Client, guildId: string, channelId: string, token: symbol): Promise<void> {
  if (!isRuntimeActive(guildId, token)) return;
  const existing = await loadOracleCouncil(guildId);
  if (!isRuntimeActive(guildId, token)) return;
  if (existing?.status === "open") {
    if (existing.closesAt > Date.now()) return;
    await finalizeCouncil(client, guildId, existing.id, token);
  }

  const proposal = pick(COUNCIL_PROPOSALS);
  const now = Date.now();
  const council: OracleCouncilRecord = {
    id: randomUUID(),
    guildId,
    channelId,
    messageId: "",
    question: proposal.question,
    options: proposal.options,
    votes: {},
    openedAt: now,
    closesAt: now + COUNCIL_VOTING_WINDOW_MS,
    status: "open",
  };
  const channel = await getChannel(client, channelId);
  if (!channel || !isRuntimeActive(guildId, token)) return;

  const sent = await channel.send({
    content: "",
    embeds: [councilEmbed(council)],
    components: [councilButtons(council)],
    allowedMentions: { parse: [] },
  });
  council.messageId = sent.id;
  await saveOracleCouncil(council);
  const delay = council.closesAt - Date.now();
  scheduleCouncilClose(client, council, token);
  logger.info({ guildId, councilId: council.id, closesInMinutes: Math.round(delay / MINUTE) }, "Oracle council opened");
}

export function isOracleCouncilButton(customId: string): boolean {
  return customId.startsWith("council_vote_");
}

export async function handleOracleCouncilVote(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const match = interaction.customId.match(/^council_vote_([^_]+)_(.+)$/);
  const guildId = interaction.guildId;
  if (!match || !guildId) {
    await interaction.editReply("🕯️ Acest glas nu aparține niciunui Regat.");
    return;
  }
  if (!isOracleEnabled(guildId)) {
    await interaction.editReply("🛑 Oracle AI este oprit momentan. Un administrator îl poate reporni cu `/startai`.");
    return;
  }
  const [, councilId, optionId] = match;
  let result: Awaited<ReturnType<typeof castOracleCouncilVote>>;
  try {
    result = await castOracleCouncilVote(guildId, councilId!, interaction.user.id, optionId!);
  } catch (err) {
    logger.error({ err, guildId, userId: interaction.user.id }, "Could not cast council vote");
    await interaction.editReply("❌ Glasul nu a putut fi înscris. Încearcă din nou.").catch(() => null);
    return;
  }
  if (result.status === "accepted") {
    try {
      await interaction.message.edit({
        embeds: [councilEmbed(result.council)],
        components: [councilButtons(result.council)],
      });
    } catch (err) {
      logger.warn({ err, guildId, userId: interaction.user.id }, "Could not update council vote message");
    }
    await interaction.editReply("🕯️ Glasul tău a fost înscris în cronica Cenușii.");
    void recordOracleInteraction(
      interaction.user.id,
      guildId,
      interaction.user.username,
      "Am lăsat un glas în Consiliul Umbrelor.",
      "council",
      2,
    ).catch((err) => {
      logger.warn({ err, guildId, userId: interaction.user.id }, "Could not save council relationship memory");
    });
    return;
  }
  if (result.status === "already_voted") {
    await interaction.editReply("⚖️ Un singur glas pentru fiecare suflet. Urna ți-a primit deja alegerea.");
    return;
  }
  if (result.status === "closed") {
    await interaction.editReply("🌑 Urnele Consiliului sunt închise. Hotărârea a fost deja pecetluită.");
    return;
  }
  await interaction.editReply("🕯️ Glasul nu a putut fi înscris în această urnă.");
}

export function startOracleCouncilScheduler(
  client: Client,
  guildId: string,
  channelId: string,
  isStopped: () => boolean = () => false,
): void {
  if (councilRuntimes.has(guildId)) return;
  if (!COUNCIL_ENABLED) return;
  const token = Symbol(guildId);
  const runtime: CouncilRuntime = { token, isStopped };
  councilRuntimes.set(guildId, runtime);

  const schedule = (delay: number) => {
    if (!isRuntimeActive(guildId, token)) return;
    runtime.schedulerTimer = setTimeout(() => {
      if (!isRuntimeActive(guildId, token)) {
        stopOracleCouncilScheduler(guildId);
        return;
      }
      void openCouncil(client, guildId, channelId, token).finally(() => schedule(COUNCIL_INTERVAL_MS));
    }, delay);
    runtime.schedulerTimer.unref?.();
  };
  void loadOracleCouncil(guildId)
    .then((existing) => {
      if (existing?.status === "open" && isRuntimeActive(guildId, token)) {
        scheduleCouncilClose(client, existing, token);
      } else if (existing?.status === "closed" && isRuntimeActive(guildId, token)) {
        if (!existing.resolvedAt) {
          void finalizeCouncil(client, guildId, existing.id, token).catch((err) =>
            logger.warn({ err, guildId, councilId: existing.id }, "Closed council settlement could not be resumed"),
          );
        } else if (existing.cleanupAt) {
          scheduleCouncilMessageDeletion(client, existing);
        } else {
          // Councils created before cleanup metadata existed should not remain
          // permanently in the channel.
          void deleteCouncilMessages(client, existing);
        }
      }
    })
    .catch((err) => logger.warn({ err, guildId }, "Open council could not be rehydrated"));
  schedule(COUNCIL_FIRST_DELAY_MS);
  logger.info({ guildId, firstInMinutes: COUNCIL_FIRST_DELAY_MS / MINUTE }, "Oracle council scheduler started");
}

export function stopOracleCouncilScheduler(guildId: string): void {
  const runtime = councilRuntimes.get(guildId);
  if (!runtime) return;
  if (runtime.schedulerTimer) clearTimeout(runtime.schedulerTimer);
  if (runtime.closeTimer) clearTimeout(runtime.closeTimer);
  councilRuntimes.delete(guildId);
}
