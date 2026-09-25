import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { loadAllianceRecruitmentText } from "./db";
import { IMG } from "./assets";
import {
  claimTicketAlliancePublication,
  finishTicketAlliancePublication,
  loadTicketProgress,
  loadTicketProgressForChannel,
  rejectTicketAlliance,
  releaseTicketAlliancePublication,
  saveTicketProgress,
  type TicketProgressRecord,
} from "./db";
import type { OracleTicketKind } from "./oracle-chat";
import { DEFAULT_TICKET_CONFIG, getTicketConfig, type TicketFlowConfig } from "./ticket-config";

const TICKET_COLORS: Record<OracleTicketKind, number> = {
  staff: 0x9b4655,
  partnership: 0x7c8fbd,
  help_report: 0x9d6578,
};

const TICKET_LABELS: Record<OracleTicketKind, string> = {
  staff: "Aplicare Staff",
  partnership: "Propunere de Parteneriat",
  help_report: "Ajutor / Raportare",
};

const TICKET_ICONS: Record<OracleTicketKind, string> = {
  staff: "🛡️",
  partnership: "🤝",
  help_report: "🕯️",
};

const TICKET_SEAL = IMG.ticketSeal;
export const STAFF_REVIEW_ROLE_ID = DEFAULT_TICKET_CONFIG.staffReviewRoleId;
/** The historical alliance destination, valid only in its owning guild. */
export const ALLIANCE_PUBLIC_CHANNEL_ID = DEFAULT_TICKET_CONFIG.alliancePublicChannelId;
const ALLIANCE_OWNER_GUILD_ID = DEFAULT_TICKET_CONFIG.allianceOwnerGuildId;
export const INCOMPLETE_TICKET_TIMEOUT_MS = DEFAULT_TICKET_CONFIG.incompleteTimeoutMinutes * 60 * 1000;
export const INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS = DEFAULT_TICKET_CONFIG.firstWarningMinutes * 60 * 1000;
export const INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS = DEFAULT_TICKET_CONFIG.secondWarningMinutes * 60 * 1000;
/** Backwards-compatible alias for the first warning threshold. */
export const INCOMPLETE_TICKET_WARNING_AFTER_MS = INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS;
const REGAT_RECRUITMENT_GIF_URL =
  "https://media.discordapp.net/attachments/1477699914732404977/1477704399936688212/standard.gif?ex=6a45e937&is=6a4497b7&hm=f9c71749fd5197b10bcdb4d367da427d7e2e58283087d29907d73fc8d12015b0";
const REGAT_INVITE_URL = "https://discord.gg/regatulcenusii";
const REGATUL_CENUSII_DESCRIPTION =
  "Regatul Cenușii este un server Discord RPG cooperativ dark-fantasy, cu clase, lupte, boss-i, XP, Oboli, companioni, relicve și evenimente pentru întreaga comunitate.";

function publicTicketImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
    .split(",")[0]?.trim();
  return domain && raw.startsWith("/") ? `https://${domain}${raw}` : null;
}

function setTicketImage(embed: EmbedBuilder, raw: string | undefined): void {
  const imageUrl = publicTicketImageUrl(raw);
  if (imageUrl) embed.setImage(imageUrl);
}

function setTicketMedia(
  embed: EmbedBuilder,
  imageUrl: string | undefined,
  thumbnailUrl: string | undefined,
): void {
  setTicketImage(embed, imageUrl);
  const publicThumbnailUrl = publicTicketImageUrl(thumbnailUrl);
  if (publicThumbnailUrl) embed.setThumbnail(publicThumbnailUrl);
}

type RoleMembership = {
  roles:
    | readonly string[]
    | {
        cache: {
          has(roleId: string): boolean;
        };
      };
};

export function memberHasStaffReviewRole(
  member: RoleMembership | null | undefined,
  roleId = STAFF_REVIEW_ROLE_ID,
): boolean {
  if (!member) return false;
  return "cache" in member.roles
    ? member.roles.cache.has(roleId)
    : member.roles.includes(roleId);
}

const postedTicketPanels = new Set<string>();
const ticketPanelLocks = new Map<string, Promise<boolean>>();
const ticketDeletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ticketWarningTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
type TicketProgressState = TicketProgressRecord;
const ticketProgress = new Map<string, TicketProgressState>();

const DISCORD_SHORT_INPUT_MAX_LENGTH = 200;
const DISCORD_PARAGRAPH_INPUT_MAX_LENGTH = 900;
const DISCORD_MODAL_PLACEHOLDER_MAX_LENGTH = 100;
const DISCORD_MODAL_LABEL_MAX_LENGTH = 45;
const DISCORD_MESSAGE_MAX_LENGTH = 2000;

const TICKET_PANEL_TITLES: Record<OracleTicketKind, string> = {
  staff: "🛡️ Contract de Staff · Deschide aplicația",
  partnership: "🤝 Contract de Parteneriat · Deschide propunerea",
  help_report: "🕯️ Solicitare pentru Staff · Deschide sesizarea",
};

const TICKET_STATUS_LABELS: Record<
  "completed" | "rejected",
  string
> = {
  completed: "✅ Contract închis · complet",
  rejected: "⛔ Contract închis · respins",
};

function ticketProgressKey(channelId: string, applicantId: string): string {
  return `${channelId}:${applicantId}`;
}

type TicketQuestion = {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
};

const TICKET_QUESTIONS: Record<OracleTicketKind, TicketQuestion[]> = {
  staff: [
    {
      key: "name",
      label: "1. Nume",
      description: "Care este numele tău?",
      placeholder: "Ex.: Andrei",
    },
    {
      key: "age",
      label: "2. Vârstă",
      description: "Ce vârstă ai?",
      placeholder: "Ex.: 21",
    },
    {
      key: "moderation",
      label: "3. Experiență în moderare",
      description: "Ai experiență în moderare?",
      placeholder: "Unde ai mai moderat și ce ai învățat?",
      multiline: true,
    },
    {
      key: "availability",
      label: "4. Timp disponibil",
      description: "Cât timp poți dedica serverului?",
      placeholder: "Ex.: 1–2 ore pe zi",
    },
    {
      key: "motivation",
      label: "5. De ce dorești rolul?",
      description: "De ce dorești rolul de staff?",
      placeholder: "Ce te motivează să ajuți Regatul?",
      multiline: true,
    },
    {
      key: "conflict",
      label: "6. Conflict între membri",
      description: "Cum ai rezolva un conflict între membri?",
      placeholder: "Descrie pașii pe care i-ai urma.",
      multiline: true,
    },
    {
      key: "improvements",
      label: "7. Îmbunătățiri pentru server",
      description: "Ce ai îmbunătăți pe server?",
      placeholder: "Propune una sau mai multe îmbunătățiri.",
      multiline: true,
    },
    {
      key: "server_tag",
      label: "8. Tag-ul serverului",
      description: "Accepți să porți tag-ul serverului?",
      placeholder: "Răspunde clar cu Da sau Nu.",
    },
  ],
  partnership: [
    {
      key: "server_name",
      label: "1. Numele serverului",
      description: "Cum se numește serverul vostru?",
      placeholder: "Ex.: Regatul Umbrelor",
    },
    {
      key: "representative",
      label: "2. Reprezentantul serverului",
      description: "Cine reprezintă serverul în această alianță?",
      placeholder: "Numele și username-ul reprezentantului",
    },
    {
      key: "invite",
      label: "3. Linkul serverului",
      description: "Care este invitația Discord a serverului?",
      placeholder: "https://discord.gg/...",
    },
    {
      key: "members",
      label: "4. Membri și activitate",
      description: "Câți membri aveți și câți sunt activi aproximativ?",
      placeholder: "Ex.: 2.000 total · 300 activi",
    },
    {
      key: "description",
      label: "5. Descrierea serverului",
      description: "Descrieți serverul, tematica și comunitatea. Nu includeți linkul aici.",
      placeholder: "Prezentați serverul și atmosfera comunității.",
      multiline: true,
    },
    {
      key: "motivation",
      label: "6. Motivul alianței",
      description: "De ce doriți o alianță cu Regatul Cenușii?",
      placeholder: "Ce vă face să căutați acest pact?",
      multiline: true,
    },
    {
      key: "offer",
      label: "7. Ce oferă serverul vostru",
      description: "Ce puteți oferi în cadrul alianței?",
      placeholder: "Promovare, evenimente, comunitate sau alte beneficii.",
      multiline: true,
    },
    {
      key: "terms",
      label: "8. Așteptări și reguli",
      description: "Ce așteptați de la Regatul Cenușii și acceptați regulile pactului?",
      placeholder: "Scrieți condițiile și confirmați că veți respecta alianța.",
      multiline: true,
    },
  ],
  help_report: [
    {
      key: "type",
      label: "Tipul solicitării",
      description: "Este ajutor tehnic sau raportare?",
      placeholder: "Ex.: ajutor tehnic / raportare",
    },
    {
      key: "target",
      label: "Membrul raportat",
      description: "Completează dacă este o raportare.",
      placeholder: "Numele sau mențiunea membrului",
    },
    {
      key: "description",
      label: "Ce s-a întâmplat?",
      description: "Descrie cazul cât mai clar.",
      placeholder: "Povestește ce s-a întâmplat.",
      multiline: true,
    },
    {
      key: "when",
      label: "Când s-a întâmplat?",
      description: "Data sau momentul aproximativ.",
      placeholder: "Ex.: astăzi, în jurul orei 18:00",
    },
    {
      key: "evidence",
      label: "Dovezi",
      description: "Linkuri, capturi sau mesaje relevante.",
      placeholder: "Adaugă linkuri sau explică ce dovezi ai.",
      multiline: true,
    },
  ],
};

function ticketFlow(guildId: string | null | undefined, kind: OracleTicketKind): TicketFlowConfig {
  return getTicketConfig(guildId).flows[kind];
}

function ticketQuestions(guildId: string | null | undefined, kind: OracleTicketKind): TicketQuestion[] {
  const flow = ticketFlow(guildId, kind);
  return flow.mode === "custom" ? flow.questions : TICKET_QUESTIONS[kind];
}

/** Private ticket summaries include every configured question, regardless of public posting settings. */
function privateQuestionSummaryEmbeds(
  first: EmbedBuilder,
  questions: TicketQuestion[],
  answers: Record<string, string>,
): EmbedBuilder[] {
  const embeds = [first];
  // Discord caps embeds at 25 fields and 6000 characters across the entire message.
  // Send additional embeds as separate messages below if the total exceeds that limit.
  let current = first;
  let length = JSON.stringify(first.toJSON()).length;
  let fields = first.toJSON().fields?.length ?? 0;
  for (const question of questions) {
    const answer = (answers[question.key]?.trim() || "—").replace(/@/g, "@\u200b");
    for (let start = 0, part = 1; start < answer.length; start += 1024, part++) {
      const name = part === 1
        ? question.label.slice(0, 256)
        : `${question.label.slice(0, 225)} (continuare ${part})`;
      const value = answer.slice(start, start + 1024);
      if (fields >= 25 || length + name.length + value.length > 4800) {
        current = new EmbedBuilder().setColor(0x7c8fbd).setTitle("📜 Rezumat · continuare");
        embeds.push(current);
        length = 100;
        fields = 0;
      }
      current.addFields({ name, value, inline: false });
      length += name.length + value.length;
      fields++;
    }
  }
  return embeds;
}

async function sendPrivateSummary(
  channel: { send: (payload: any) => Promise<Message> },
  embeds: EmbedBuilder[],
  payload: { content?: string; components?: ActionRowBuilder<ButtonBuilder>[]; allowedMentions: { parse: never[]; roles?: string[] } },
): Promise<Message> {
  // Keep the actionable summary last; all previous chunks contain only private answers.
  for (let i = 0; i < embeds.length - 1; i++) {
    await channel.send({ embeds: [embeds[i]!], allowedMentions: { parse: [] } });
  }
  return channel.send({ ...payload, embeds: [embeds[embeds.length - 1]!] });
}

async function removePreviousContinuation(
  interaction: ModalSubmitInteraction,
  previousMessageId: string | undefined,
): Promise<void> {
  if (!previousMessageId || !interaction.channel || !("messages" in interaction.channel)) return;
  try {
    const previous = await interaction.channel.messages.fetch(previousMessageId);
    if (previous.id === previousMessageId &&
      previous.components.some((row) => "components" in row && row.components.some((component) =>
        "customId" in component && typeof component.customId === "string" &&
        /^ticket_next_(staff|partnership|help_report)_\d+$/.test(component.customId),
      ))) {
      await previous.edit({ components: [] });
    }
  } catch (err) {
    logger.debug({ err, channelId: interaction.channelId, previousMessageId }, "Could not clear old ticket continuation");
  }
}

async function dismissTicketSuccess(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    await interaction.deleteReply();
  } catch (err) {
    logger.debug({ err, channelId: interaction.channelId }, "Could not dismiss successful ticket modal reply");
  }
}

function ticketQuestion(
  kind: OracleTicketKind,
  key: string,
  guildId?: string | null,
): TicketQuestion | null {
  return ticketQuestions(guildId, kind).find((question) => question.key === key) ?? null;
}

function ticketPanelFallback(kind: OracleTicketKind): string {
  if (kind === "staff") {
    return (
      "🛡️ **Aplicare Staff**\n\n" +
      "Tag-ul serverului este obligatoriu pentru validarea aplicației.\n" +
      "Fără tag → aplicația este respinsă automat.\n\n" +
      "Apasă butonul pentru a răspunde la întrebări în ordinea afișată."
    );
  }
  if (kind === "partnership") {
    return (
      "🤝 **Propunere de Parteneriat**\n\n" +
      "Alege din meniul interactiv informațiile despre server, comunitate și colaborare."
    );
  }
  return "🕯️ **Ajutor / Raportare**\n\nAlege din meniul interactiv ce vrei să descrii pentru staff.";
}

export function isLegacyOracleTicketPromptText(content: string): boolean {
  const hasTicketTitle =
    /(?:Aplicare Staff|Propunere de Parteneriat|Ajutor\s*\/\s*Raportare)/i.test(content);
  const numberedQuestions = content.match(/(?:^|\n)\s*\d+[.)]\s/g)?.length ?? 0;
  const hasFormLanguage =
    /(?:în această ordine|trimite-mi aceste câmpuri|completează.+(?:câmp|întreb)|formular|răspunde.+(?:punct|întreb))/i.test(
      content,
    );
  return numberedQuestions >= 5 && (hasTicketTitle || hasFormLanguage || numberedQuestions >= 8);
}

function isLegacyOracleTicketPrompt(message: Message, botId: string): boolean {
  if (message.author.id !== botId || message.components.length > 0) return false;
  return isLegacyOracleTicketPromptText(message.content ?? "");
}

function ticketStartButton(kind: OracleTicketKind, label?: string): ButtonBuilder {
  const rawLabel = label ?? "Deschide contractul";
  const customEmoji = /<(a?):([a-zA-Z0-9_]+):(\d+)>/.exec(rawLabel);
  const button = new ButtonBuilder()
    .setCustomId(`ticket_start_${kind}`)
    .setLabel(rawLabel.replace(/<(?:a?):[a-zA-Z0-9_]+:\d+>/g, "").trim() || "Deschide contractul")
    .setStyle(ButtonStyle.Primary);
  if (customEmoji) {
    button.setEmoji({ id: customEmoji[3], name: customEmoji[2], animated: customEmoji[1] === "a" });
  }
  return button;
}

/** The ticket's single absolute deadline is anchored to channel creation. */
export function ticketDeadlineForChannel(
  channel: unknown,
  now = Date.now(),
): number {
  const guildId =
    channel &&
    typeof channel === "object" &&
    "guildId" in channel &&
    typeof channel.guildId === "string"
      ? channel.guildId
      : undefined;
  const timeoutMs = getTicketConfig(guildId).incompleteTimeoutMinutes * 60 * 1000;
  const createdTimestamp =
    channel &&
    typeof channel === "object" &&
    "createdTimestamp" in channel &&
    typeof channel.createdTimestamp === "number" &&
    Number.isFinite(channel.createdTimestamp)
      ? channel.createdTimestamp
      : now;
  return createdTimestamp + timeoutMs;
}

export function ticketStatusRow(
  kind: OracleTicketKind,
  status: "completed" | "rejected",
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_status_${kind}_${status}`)
      .setLabel(TICKET_STATUS_LABELS[status])
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

export function ticketPanelPayload(
  kind: OracleTicketKind,
  deadline = ticketDeadlineForChannel(undefined),
  guildId?: string | null,
): {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  const color = TICKET_COLORS[kind];
  const flow = ticketFlow(guildId, kind);
  if (flow.mode === "custom") {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(flow.title)
      .setDescription(flow.panelDescription)
      .addFields(
        { name: "📜 Întrebări", value: `${flow.questions.length} întrebări · răspunsurile sunt cerute în ordine.` },
        { name: "📖 Ghid", value: flow.requirementsText, inline: false },
        {
          name: "⏳ Termen și stare",
          value:
            `Completează ticketul până la <t:${Math.floor(deadline / 1000)}:F> ` +
            `(<t:${Math.floor(deadline / 1000)}:R>).`,
          inline: false,
        },
      )
      .setFooter({ text: "Regatul Cenușii · Citește informațiile înainte de a începe" });
    if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
    setTicketMedia(embed, flow.panelImageUrl, flow.panelThumbnailUrl);
    return {
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(ticketStartButton(kind, flow.startButtonLabel))],
    };
  }
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(TICKET_PANEL_TITLES[kind])
    .setDescription(
      kind === "staff"
        ? "Un contract de candidatură pentru Regatul Cenușii.\n" +
          "Răspunde pe rând la fiecare întrebare; formularul de staff are două pagini."
        : kind === "partnership"
          ? "Un contract de colaborare între două comunități.\n" +
            "Completează cele două pagini pentru ca stafful să poată verifica pactul."
          : "O declarație pentru staff, cu detaliile necesare pentru ajutor sau raportare.\n" +
            "Întrebările se deschid una câte una, în ordinea contractului.",
    )
    .addFields(
      kind === "staff"
        ? [
            {
              name: "⚠️ Condiție obligatorie",
              value:
                "Tag-ul serverului este **OBLIGATORIU** pentru validarea aplicației.\n" +
                "Fără tag, aplicația este respinsă automat.",
            },
            {
              name: "📜 Contractul",
                value:
                  `${TICKET_QUESTIONS.staff.length} întrebări · două pagini de formular.\n` +
                  "Pagina 1 colectează primele cinci răspunsuri; pagina 2 închide candidatura.",
            },
          ]
        : kind === "partnership"
          ? [
              {
                name: "📜 Contractul",
                value:
                  `${TICKET_QUESTIONS[kind].length} întrebări · două pagini de formular.\n` +
                  "Verifică rezumatul înainte ca stafful să confirme publicarea.",
              },
            ]
          : [
              {
                name: "📜 Traseul sesizării",
                value:
                  `${TICKET_QUESTIONS[kind].length} întrebări · un răspuns pe pas.\n` +
                  "Meniul păstrează ordinea contractului.",
              },
            ],
    )
    .addFields({
      name: "⏳ Termen și stare",
      value:
        `Completează ticketul până la <t:${Math.floor(deadline / 1000)}:F> ` +
        `(<t:${Math.floor(deadline / 1000)}:R>).\n` +
        `Avertismentele vin după ${getTicketConfig(guildId).firstWarningMinutes} și ` +
        `${getTicketConfig(guildId).secondWarningMinutes} de minute; un contract incomplet ` +
        `este șters după ${getTicketConfig(guildId).incompleteTimeoutMinutes} de minute.`,
      inline: false,
    })
    .setFooter({ text: "Regatul Cenușii · Citește contractul înainte de a începe" });
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(ticketStartButton(kind));

  return { embeds: [embed], components: [row] };
}

export async function postTicketPanelIfMissing(
  channel: Message["channel"],
  kind: OracleTicketKind,
  botId: string,
): Promise<boolean> {
  if (postedTicketPanels.has(channel.id)) return false;
  const pending = ticketPanelLocks.get(channel.id);
  if (pending) {
    await pending;
    return false;
  }

  const operation = (async () => {
    if (!channel.isTextBased() || !("messages" in channel) || !("send" in channel)) {
      return false;
    }

    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const legacyPrompts = recent?.filter((entry) => isLegacyOracleTicketPrompt(entry, botId));
    if (legacyPrompts?.size) {
      await Promise.all(
        legacyPrompts.map((entry) =>
          entry.delete().catch((err) => {
            logger.debug(
              { err, channelId: channel.id, messageId: entry.id },
              "Could not remove legacy Oracle ticket prompt",
            );
          }),
        ),
      );
    }
    const existingPanel = recent?.find((entry) =>
      isTicketPanelMessage(entry, botId, kind),
    );
    if (existingPanel) {
      const isActivePanel = existingPanel.components.some((row) => {
        if (!("components" in row)) return false;
        return row.components.some(
          (component) =>
            "customId" in component &&
            component.customId === `ticket_start_${kind}`,
        );
      });
      if (isActivePanel) {
        const refreshed = await existingPanel.edit(
          ticketPanelPayload(
            kind,
            ticketDeadlineForChannel(channel),
            "guildId" in channel && typeof channel.guildId === "string" ? channel.guildId : undefined,
          ),
        ).then(() => true).catch((err) => {
          logger.warn(
            { err, channelId: channel.id, ticketKind: kind },
            "Could not refresh existing interactive ticket panel",
          );
          return false;
        });
        if (!refreshed) return false;
      }
      postedTicketPanels.add(channel.id);
      return false;
    }

    let interactiveSent = false;
    try {
      await channel.send(
        ticketPanelPayload(
          kind,
          ticketDeadlineForChannel(channel),
          "guildId" in channel && typeof channel.guildId === "string" ? channel.guildId : undefined,
        ),
      );
      interactiveSent = true;
    } catch (err) {
      logger.error(
        { err, channelId: channel.id, ticketKind: kind },
        "Interactive ticket panel failed — sending plain-text fallback",
      );
      try {
        await channel.send({
          content: ticketPanelFallback(kind),
          allowedMentions: { parse: [] },
        });
      } catch (fallbackErr) {
        logger.error(
          { err: fallbackErr, channelId: channel.id, ticketKind: kind },
          "Ticket panel fallback could not be posted",
        );
        return false;
      }
    }
    if (interactiveSent) {
      postedTicketPanels.add(channel.id);
      return true;
    }
    // A plain-text fallback is useful to the user, but it is not a posted
    // panel: retry after reconnect so the interactive contract is available.
    return false;
  })();

  ticketPanelLocks.set(channel.id, operation);
  try {
    return await operation;
  } finally {
    ticketPanelLocks.delete(channel.id);
  }
}

function hasFinishedTicketStatus(message: {
  components?: readonly { components?: readonly { customId?: string | null }[] }[];
}): boolean {
  return (message.components ?? []).some((row) =>
    (row.components ?? []).some((component) =>
      typeof component.customId === "string" &&
      /^ticket_status_(staff|partnership|help_report)_(completed|rejected)$/.test(component.customId),
    ),
  );
}

async function ticketHasFinishedStatus(channel: {
  messages?: {
    fetch?: (options: { limit: number }) => Promise<Iterable<{ components?: readonly { components?: readonly { customId?: string | null }[] }[] }>>;
  };
}): Promise<boolean> {
  const messages = await channel.messages?.fetch?.({ limit: 100 }).catch(() => null);
  if (!messages) return false;
  for (const message of messages) {
    if (hasFinishedTicketStatus(message)) return true;
  }
  return false;
}

function ticketMemberOverwrites(channel: {
  client?: { user?: { id: string } | null };
  permissionOverwrites?: {
    cache?: Iterable<{
      id?: string;
      type?: number | string;
      allow?: { has?: (permission: bigint) => boolean };
    }> | {
      values(): IterableIterator<{
        id?: string;
        type?: number | string;
        allow?: { has?: (permission: bigint) => boolean };
      }>;
    };
  };
}): string[] {
  const cache = channel.permissionOverwrites?.cache;
  const overwrites = cache && "values" in cache ? cache.values() : cache ?? [];
  return [...overwrites].filter((overwrite) =>
    (overwrite.type === 1 || overwrite.type === "member") &&
    typeof overwrite.id === "string" &&
    overwrite.id !== channel.client?.user?.id &&
    overwrite.allow?.has?.(PermissionFlagsBits.ViewChannel) === true,
  ).map((overwrite) => overwrite.id!);
}

export function scheduleIncompleteTicketDeletion(channel: unknown): void {
  if (!channel || typeof channel !== "object") return;
  const candidate = channel as {
    id?: string;
    guildId?: string | null;
    createdTimestamp?: number;
    delete?: (reason?: string) => Promise<unknown>;
    client?: { user?: { id: string } | null };
    send?: (payload: {
      content: string;
      allowedMentions: { parse: never[]; users?: string[] };
    }) => Promise<unknown>;
    permissionOverwrites?: Parameters<typeof ticketMemberOverwrites>[0]["permissionOverwrites"];
    messages?: {
      fetch?: (options: { limit: number }) => Promise<Iterable<{ components?: readonly { components?: readonly { customId?: string | null }[] }[] }>>;
    };
  };
  if (
    !candidate.id ||
    typeof candidate.createdTimestamp !== "number" ||
    typeof candidate.delete !== "function"
  ) {
    return;
  }

  const existingTimer = ticketDeletionTimers.get(candidate.id);
  if (existingTimer) clearTimeout(existingTimer);
  for (const existingWarningTimer of ticketWarningTimers.get(candidate.id) ?? []) {
    clearTimeout(existingWarningTimer);
  }
  ticketWarningTimers.delete(candidate.id);
  const deleteChannel = candidate.delete;
  if (!deleteChannel) return;

  const deadline = ticketDeadlineForChannel(candidate);
  const ticketConfig = getTicketConfig(candidate.guildId);
  const sendWarning = async (warningNumber: 1 | 2): Promise<void> => {
    const channelId = candidate.id!;
    if (await ticketHasFinishedStatus(candidate)) return;
    if (typeof candidate.send !== "function") return;
    let applicants: Awaited<ReturnType<typeof loadTicketProgressForChannel>>;
    try {
      applicants = await loadTicketProgressForChannel(channelId);
    } catch (err) {
      logger.warn({ err, channelId }, "Could not verify ticket completion before warning");
      return;
    }
    if (applicants.some(({ progress }) => progress.status)) return;
    const fallbackMembers = ticketMemberOverwrites(candidate);
    const applicantId = applicants.length === 1
      ? applicants[0]!.applicantId
      : applicants.length === 0 && fallbackMembers.length === 1 ? fallbackMembers[0] : undefined;
    const mention = applicantId ? `<@${applicantId}> ` : "";

    await candidate.send({
      content:
        `${warningNumber === 1 ? "⚠️" : "🚨"} ${mention}**Avertisment ${warningNumber}/2 — ticket incomplet**\n` +
        `Au trecut ${warningNumber === 1 ? ticketConfig.firstWarningMinutes : ticketConfig.secondWarningMinutes} de minute. ` +
        `Formularul nu a fost finalizat. Dacă nu îl completezi până la <t:${Math.floor(deadline / 1000)}:R>, ` +
        "ticketul va fi șters automat.",
      allowedMentions: applicantId ? { parse: [], users: [applicantId] } : { parse: [] },
    }).catch((err) => {
      logger.debug({ err, channelId }, "Incomplete ticket warning could not be posted");
    });
  };

  const warningTimers = [
    setTimeout(() => { void sendWarning(1); }, Math.max(
      0,
      candidate.createdTimestamp + ticketConfig.firstWarningMinutes * 60 * 1000 - Date.now(),
    )),
    setTimeout(() => { void sendWarning(2); }, Math.max(
      0,
      candidate.createdTimestamp + ticketConfig.secondWarningMinutes * 60 * 1000 - Date.now(),
    )),
  ];
  for (const warningTimer of warningTimers) warningTimer.unref?.();
  ticketWarningTimers.set(candidate.id, warningTimers);

  const delay = Math.max(
    0,
    deadline - Date.now(),
  );
  const timer = setTimeout(async () => {
    ticketDeletionTimers.delete(candidate.id!);
    const channelId = candidate.id!;
    if (await ticketHasFinishedStatus(candidate)) return;
    try {
      const applicants = await loadTicketProgressForChannel(channelId);
      if (applicants.some(({ progress }) => progress.status)) return;
    } catch (err) {
      logger.warn({ err, channelId }, "Could not verify ticket completion before deletion");
      return;
    }

    try {
      for (const warningTimer of ticketWarningTimers.get(channelId) ?? []) {
        clearTimeout(warningTimer);
      }
      ticketWarningTimers.delete(channelId);
      await deleteChannel.call(candidate, `Ticket incomplet după ${ticketConfig.incompleteTimeoutMinutes} de minute`);
      postedTicketPanels.delete(channelId);
      for (const key of ticketProgress.keys()) {
        if (key.startsWith(`${channelId}:`)) ticketProgress.delete(key);
      }
      logger.info({ channelId }, "Incomplete ticket deleted after 60 minutes");
    } catch (err) {
      logger.debug({ err, channelId }, "Incomplete ticket could not be deleted");
    }
  }, delay);
  timer.unref?.();
  ticketDeletionTimers.set(candidate.id, timer);
}

function input(
  customId: string,
  label: string,
  placeholder: string,
  style = TextInputStyle.Short,
  required = true,
  maxLength = style === TextInputStyle.Paragraph
    ? DISCORD_PARAGRAPH_INPUT_MAX_LENGTH
    : DISCORD_SHORT_INPUT_MAX_LENGTH,
): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label.slice(0, DISCORD_MODAL_LABEL_MAX_LENGTH))
    .setPlaceholder(placeholder.slice(0, DISCORD_MODAL_PLACEHOLDER_MAX_LENGTH))
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(Math.min(Math.max(1, maxLength), 4000));
}

export function ticketModal(kind: OracleTicketKind): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_${kind}`)
    .setTitle(
      kind === "staff"
        ? "Aplicare Staff · 1/2"
        : kind === "partnership"
          ? "Propunere de Parteneriat · 1/2"
          : TICKET_LABELS[kind],
    );

  const fields =
    kind === "staff"
      ? [
          input("staff_name", "Nume", "Ex.: Andrei"),
          input("staff_age", "Vârsta", "Ex.: 21"),
          input("staff_experience", "Experiență în moderare", "Unde ai mai moderat și ce ai învățat?", TextInputStyle.Paragraph),
          input("staff_availability", "Timp disponibil", "Ex.: 1–2 ore pe zi"),
          input("staff_motivation", "De ce staff?", "De ce vrei să ajuți Regatul?", TextInputStyle.Paragraph),
        ]
      : kind === "partnership"
        ? [
            input("partnership_name", "Numele serverului", "Ex.: Regatul Umbrelor"),
            input("partnership_representative", "Reprezentantul serverului", "Nume și username Discord"),
            input("partnership_invite", "Invitație / link", "https://discord.gg/..."),
            input("partnership_members", "Membri și activitate", "Ex.: 2.000 total · 300 activi"),
            input(
              "partnership_description",
              "Descrierea serverului",
              "Tematică, comunitate și ce oferiți, fără link aici",
              TextInputStyle.Paragraph,
            ),
          ]
        : [
            input("help_type", "Tipul solicitării", "Ajutor tehnic sau raportare membru"),
            input("help_target", "Membrul raportat", "Completează doar dacă este o raportare", TextInputStyle.Short, false),
            input("help_description", "Ce s-a întâmplat?", "Descrie cazul cât mai clar", TextInputStyle.Paragraph),
            input("help_when", "Când s-a întâmplat?", "Data sau momentul aproximativ"),
            input("help_evidence", "Dovezi", "Linkuri, capturi sau mesaje relevante", TextInputStyle.Paragraph, false),
          ];

  for (const field of fields) {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
  }
  return modal;
}

export function staffDetailsModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ticket_form_staff_details")
    .setTitle("Aplicare Staff · 2/2");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_conflict",
        "Cum ai rezolva un conflict?",
        "Descrie cum ai gestiona un conflict între membri",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_improvements",
        "Ce ai îmbunătăți pe server?",
        "Propune una sau mai multe îmbunătățiri",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "staff_tag",
        "Accepți să porți tag-ul?",
        "Răspunde clar cu Da sau Nu.",
      ),
    ),
  );
  return modal;
}

export function partnershipDetailsModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ticket_form_partnership_details")
    .setTitle("Propunere de Parteneriat · 2/2");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_motivation",
        "Motivul alianței",
        "De ce doriți o alianță cu Regatul Cenușii?",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_offer",
        "Ce oferă serverul vostru",
        "Promovare, evenimente, comunitate sau alte beneficii.",
        TextInputStyle.Paragraph,
      ),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      input(
        "partnership_terms",
        "Așteptări și reguli",
        "Ce așteptați și acceptați regulile pactului?",
        TextInputStyle.Paragraph,
      ),
    ),
  );
  return modal;
}

export function ticketRequirementsEmbed(kind: OracleTicketKind, guildId?: string | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(TICKET_COLORS[kind])
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Ghidul contractului`)
    .setFooter({ text: "Răspunde sincer și clar · Regatul Cenușii" });
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  const flow = ticketFlow(guildId, kind);
  if (flow.mode === "custom") {
    embed.setDescription(
      `${flow.requirementsText}\n\n` +
        flow.questions.map((question, index) => `${index + 1}. ${question.label} — ${question.description}`).join("\n"),
    );
    return embed;
  }

  if (kind === "staff") {
    embed.setDescription(
      "Tag-ul serverului este obligatoriu pentru validarea aplicației.\n\n" +
        "1. Care este numele tău?\n" +
        "2. Ce vârstă ai?\n" +
        "3. Ai experiență în moderare?\n" +
        "4. Cât timp poți dedica serverului?\n" +
        "5. De ce dorești rolul de staff?\n" +
        "6. Cum ai rezolva un conflict între membri?\n" +
        "7. Ce ai îmbunătăți pe server?\n" +
        "8. Accepți să porți tag-ul serverului?",
    );
  } else if (kind === "partnership") {
    embed.setDescription(
      "Pentru parteneriat, pregătește:\n\n" +
        "• numele serverului;\n" +
        "• reprezentantul serverului;\n" +
        "• invitația sau linkul serverului;\n" +
        "• numărul total și activ de membri;\n" +
        "• descrierea serverului — fără linkul de invitație în acest răspuns;\n" +
        "• motivul alianței;\n" +
        "• ce poate oferi serverul și ce așteaptă de la Regatul Cenușii;\n" +
        "• acceptarea regulilor pactului.",
    );
  } else {
    embed.setDescription(
      "Pentru ajutor, explică problema și pașii care au dus la ea.\n\n" +
        "Pentru raportare, include membrul raportat, ce s-a întâmplat, când s-a întâmplat și dovezile disponibile.\n\n" +
        "Raportările rămân confidențiale și sunt analizate de staff.",
    );
  }
  return embed;
}

function safeAnswer(
  value: string | undefined,
  fallback = "—",
  maxLength = DISCORD_PARAGRAPH_INPUT_MAX_LENGTH,
): string {
  return (value?.trim() || fallback)
    .replace(/@/g, "@\u200b")
    .slice(0, Math.min(Math.max(1, maxLength), 1024));
}

export function staffOracleReviewPayload(username: string, staffRoleId = STAFF_REVIEW_ROLE_ID): {
  content: string;
  embeds: EmbedBuilder[];
  allowedMentions: { parse: never[]; roles: string[] };
} {
  const safeUsername = safeAnswer(username, "călătorul");
  const embed = new EmbedBuilder()
    .setColor(0xc29a52)
    .setTitle("🕯️ Oracolul · Rezumat pentru evaluare")
    .setDescription(
      `Am primit și am așezat sub lumina Cenușii cele opt răspunsuri ale lui **${safeUsername}**. ` +
        "Contractul este complet; urmează verificarea omenească, nu un verdict automat.",
    )
    .addFields(
      {
        name: "📊 Starea dosarului",
        value: "COMPLET · în așteptarea evaluării staffului",
        inline: false,
      },
      {
        name: "🛡️ Responsabili",
        value:
          `Rolul <@&${staffRoleId}> verifică răspunsurile și comunică decizia finală.`,
        inline: false,
      },
      {
        name: "📜 Următorul pas",
        value:
          "Rămâi în ticket până când Străjerii rostesc hotărârea. " +
          "Oracolul nu promite acceptarea.",
        inline: false,
      },
    )
    .setFooter({ text: "Oracolul Cenușii · Contract pecetluit pentru revizuire" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);

  return {
    content: `<@&${staffRoleId}>`,
    embeds: [embed],
    allowedMentions: { parse: [], roles: [staffRoleId] },
  };
}

export function partnershipSummaryEmbed(
  username: string,
  answers: Record<string, string>,
  statusText = "COMPLET · pregătit pentru verificarea și confirmarea staffului",
  includeLegacyFields = true,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x7c8fbd)
    .setTitle("🤝 Contract de Parteneriat · Rezumat pentru staff")
    .setAuthor({
      name: `${safeAnswer(username, "Reprezentant", 256)} · Solicitant`,
    })
    .setDescription(
      "Datele de mai jos formează dosarul alianței. Verifică fiecare secțiune înainte de confirmare.",
    )
    .addFields({
      name: "📊 Starea dosarului",
      value: statusText,
      inline: false,
    })
    .setFooter({ text: "Regatul Cenușii · Verifică pactul înainte de publicare" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  if (includeLegacyFields) embed.addFields(
      {
        name: "🏰 Numele serverului",
        value: safeAnswer(answers.server_name),
        inline: false,
      },
      {
        name: "📝 Descrierea serverului",
        value: safeAnswer(answers.description),
        inline: false,
      },
      {
        name: "🔗 Linkul serverului",
        value: safeAnswer(answers.invite),
        inline: false,
      },
      {
        name: "👤 Reprezentantul serverului",
        value: safeAnswer(answers.representative),
        inline: false,
      },
      {
        name: "👥 Membri și activitate",
        value: safeAnswer(answers.members),
        inline: false,
      },
      {
        name: "🕯️ Motivul alianței",
        value: safeAnswer(answers.motivation),
        inline: false,
      },
      {
        name: "🎁 Ce oferă serverul",
        value: safeAnswer(answers.offer),
        inline: false,
      },
      {
        name: "📜 Așteptări și reguli",
        value: safeAnswer(answers.terms),
        inline: false,
      },
  );
  return embed;
}

function partnershipAnswersForCustomFlow(
  flow: TicketFlowConfig,
  answers: Record<string, string>,
): Record<string, string> {
  const legacyKeys = [
    "server_name",
    "representative",
    "invite",
    "members",
    "description",
    "motivation",
    "offer",
    "terms",
  ];
  const orderedAnswers = flow.questions.map((question) => answers[question.key]);
  return {
    ...answers,
    ...Object.fromEntries(
      legacyKeys.map((key, index) => [
        key,
        answers[key] ?? orderedAnswers[index] ?? "—",
      ]),
    ),
  };
}

export function partnershipConfirmRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_confirm_${userId}`)
      .setLabel("🛡️ Confirmă pentru publicare")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_reject_${userId}`)
      .setLabel("Refuză pactul")
      .setStyle(ButtonStyle.Danger),
  );
}

export function partnershipHasUnder200Members(value: string | undefined): boolean {
  const normalized = value?.trim().replace(/\s/g, "") ?? "";
  const match = normalized.match(/\d{1,3}(?:[.,]\d{3})*|\d+/);
  if (!match) return false;
  const total = Number(match[0].replace(/[.,](?=\d{3}(?:\D|$))/g, ""));
  return Number.isFinite(total) && total < 200;
}

function addSmallServerPromotionRule(
  embed: EmbedBuilder,
  members: string | undefined,
): void {
  if (partnershipHasUnder200Members(members)) {
    embed.addFields({
      name: "📌 Regula promovării",
      value: "Serverele cu sub 200 de membri se promovează fără niciun ping.",
      inline: false,
    });
  }
}

export function partnershipDraftEmbed(
  username: string,
  answers: Record<string, string>,
  statusText?: string,
): EmbedBuilder {
  const embed = partnershipSummaryEmbed(username, answers, statusText)
    .setColor(0xc29a52)
    .setTitle("🤝 Contract de Parteneriat · Draft de publicare")
    .setDescription(
      "Draftul este vizibil doar în ticket. Revizuiește informațiile, apoi editează sau publică pactul.",
    )
    .addFields({
      name: "👤 Persoana care a deschis ticketul",
      value: safeAnswer(username, "Reprezentant"),
      inline: false,
    })
    .setFooter({ text: "Draft diplomatic · Nu este publicat încă" })
    .setTimestamp();
  addSmallServerPromotionRule(embed, answers.members);
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  return embed;
}

function partnershipPublishedEmbed(
  username: string,
  answers: Record<string, string>,
): EmbedBuilder {
  return partnershipDraftEmbed(
    username,
    answers,
    "PUBLICAT · anunțul a fost trimis în canalul configurat",
  )
    .setTitle("🤝 Contract de Parteneriat · Publicat")
    .setDescription("Alianța a fost confirmată de staff, iar anunțul comunității partenere este publicat.")
    .setFooter({ text: "Pact confirmat · Regatul Cenușii" });
}

export function partnershipPublishRow(userId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_post_${userId}`)
      .setLabel("📣 Publică pactul")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_alliance_edit_${userId}`)
      .setLabel("✏️ Revizuiește draftul")
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface AllianceInviteStats {
  totalMembers: number | null;
  onlineMembers: number | null;
}

interface AllianceInviteClient {
  fetchInvite?: unknown;
}

function manualAllianceStats(value: string | undefined): AllianceInviteStats {
  const numbers = (value ?? "").match(/\d[\d.,\s]*/g)
    ?.map((entry) => Number(entry.replace(/[.,\s]/g, "")))
    .filter((entry) => Number.isFinite(entry)) ?? [];
  return {
    totalMembers: numbers[0] ?? null,
    onlineMembers: numbers[1] ?? null,
  };
}

export async function fetchAllianceInviteStats(
  client: AllianceInviteClient,
  invite: string | undefined,
): Promise<AllianceInviteStats> {
  if (!invite?.trim() || typeof client.fetchInvite !== "function") {
    return { totalMembers: null, onlineMembers: null };
  }
  try {
    const fetched = await (
      client.fetchInvite as (
        invite: string,
        options: { withCounts: boolean },
      ) => Promise<{
        approximateMemberCount?: number | null;
        approximatePresenceCount?: number | null;
      }>
    )(invite.trim(), { withCounts: true });
    return {
      totalMembers: typeof fetched.approximateMemberCount === "number"
        ? fetched.approximateMemberCount
        : null,
      onlineMembers: typeof fetched.approximatePresenceCount === "number"
        ? fetched.approximatePresenceCount
        : null,
    };
  } catch (error) {
    logger.debug({ error }, "Alliance invite counts are unavailable");
    return { totalMembers: null, onlineMembers: null };
  }
}

export function allianceAnnouncementText(
  answers: Record<string, string>,
  applicantUsername: string,
  applicantId?: string,
  template = DEFAULT_TICKET_CONFIG.allianceAnnouncementTemplate,
  stats?: AllianceInviteStats,
): string {
  const applicantMention = applicantId && /^\d+$/.test(applicantId)
    ? `<@${applicantId}>`
    : safeAnswer(applicantUsername, "Reprezentant");
  const manualStats = manualAllianceStats(answers.members);
  const values: Record<string, string> = {
    server_name: safeAnswer(answers.server_name, "Comunitatea parteneră", 200),
    representative: safeAnswer(answers.representative, "Reprezentant"),
    invite: safeAnswer(answers.invite, "Nedisponibil", 300),
    members: safeAnswer(answers.members, "Nedisponibil"),
    members_total: String(stats?.totalMembers ?? manualStats.totalMembers ?? "Nedisponibil"),
    members_online: String(stats?.onlineMembers ?? manualStats.onlineMembers ?? "Nedisponibil"),
    description: safeAnswer(answers.description, "Comunitatea nu a oferit o descriere.", 650),
    motivation: safeAnswer(answers.motivation),
    offer: safeAnswer(answers.offer),
    terms: safeAnswer(answers.terms),
    applicant: safeAnswer(applicantUsername, "Reprezentant"),
    applicant_mention: applicantMention,
  };
  return template
    .replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) => values[key] ?? match)
    .slice(0, 1950);
}

export function allianceAnnouncementEmbed(
  text: string,
  imageUrl?: string,
  imageMode: "none" | "large" | "thumbnail" = "none",
  thumbnailUrl?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x7c8fbd)
    .setDescription(text)
    .setFooter({ text: "Pact confirmat · Regatul Cenușii" })
    .setTimestamp();
  applyAllianceAnnouncementImage(embed, imageUrl, imageMode, thumbnailUrl);
  return embed;
}

function applyAllianceAnnouncementImage(
  embed: EmbedBuilder,
  rawImageUrl: string | undefined,
  imageMode: "none" | "large" | "thumbnail",
  rawThumbnailUrl?: string,
): void {
  const imageUrl = publicTicketImageUrl(rawImageUrl);
  const thumbnailUrl = publicTicketImageUrl(rawThumbnailUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  if (!imageUrl) return;
  if (imageMode === "thumbnail") {
    if (!thumbnailUrl) embed.setThumbnail(imageUrl);
  } else if (imageMode === "large") {
    embed.setImage(imageUrl);
  }
}

export function allianceAnnouncementImageEmbed(
  imageUrl: string | undefined,
  imageMode: "none" | "large" | "thumbnail",
  thumbnailUrl?: string,
): EmbedBuilder | null {
  if (
    !publicTicketImageUrl(thumbnailUrl) &&
    (!publicTicketImageUrl(imageUrl) || imageMode === "none")
  ) return null;
  const embed = new EmbedBuilder().setColor(0x7c8fbd);
  applyAllianceAnnouncementImage(embed, imageUrl, imageMode, thumbnailUrl);
  return embed;
}

export function allianceRecruitmentEmbed(
  answers: Record<string, string>,
  applicantUsername: string,
): EmbedBuilder {
  const serverName = safeAnswer(answers.server_name, "Comunitatea parteneră");
  const embed = new EmbedBuilder()
    .setColor(0x7c8fbd)
    .setTitle(`🤝 ${serverName} · Partener al Regatului Cenușii`.slice(0, 256))
    .setDescription(
      `✨ Descoperă comunitatea **${serverName}** și legătura ei cu Regatul Cenușii.\n\n` +
        safeAnswer(answers.description, "Comunitatea nu a oferit o descriere."),
    )
    .addFields(
      {
        name: "👤 Reprezentantul serverului",
        value: safeAnswer(answers.representative || applicantUsername),
        inline: true,
      },
      {
        name: "🧑‍💻 Propus de",
        value: safeAnswer(applicantUsername),
        inline: true,
      },
      {
        name: "👥 Membri și activitate",
        value: safeAnswer(answers.members),
        inline: true,
      },
      {
        name: "🔗 Link de invitație",
        value: safeAnswer(answers.invite),
        inline: false,
      },
      {
        name: "🕯️ De ce caută alianța",
        value: safeAnswer(answers.motivation),
        inline: false,
      },
      {
        name: "🎁 Ce oferă comunitatea",
        value: safeAnswer(answers.offer),
        inline: false,
      },
      {
        name: "📜 Așteptări și reguli",
        value: safeAnswer(answers.terms),
        inline: false,
      },
    )
    .setFooter({ text: "Alianță confirmată de staff · Regatul Cenușii" })
    .setTimestamp();
  if (TICKET_SEAL) embed.setThumbnail(TICKET_SEAL);
  return embed;
}

export function allianceStaffNotificationText(
  applicantUsername: string,
  staffRoleId = STAFF_REVIEW_ROLE_ID,
): string {
  const applicant = safeAnswer(applicantUsername, "un membru");
  return (
    `<@&${staffRoleId}>\n` +
    `📨 O nouă cerere de alianță a fost completată de ${applicant} și așteaptă confirmarea staffului.`
  );
}

export const DEFAULT_ALLIANCE_RECRUITMENT_TEXT = [
    "🌫️ Regatul Cenușii își deschide porțile",
    "Pentru cei destul de curajoși să pășească în umbră, Regatul Cenușii rămâne un tărâm unde magia veche, cavalerii de oțel și forțele întunecate coexistă într-o armonie plină de mister și eleganță. 👑⚔️",
    "",
    "🕯️ Ce te așteaptă în Regat:",
    "✨ Comunitate activă, primitoare și matură",
    "⚔️ Evenimente tematice, activități și provocări pentru toți",
    "🎭 Roluri unice, progresie pe nivel și sisteme bine puse la punct",
    "📜 Zone de socializare, jocuri, confesiuni și relaxare",
    "🛡️ Staff prezent, organizat și gata să ajute",
    "🌌 Atmosferă cinematică, cu identitate și lore propriu",
    "🎮 Mini-joc interactiv personalizat, creat special pentru membrii regatului — un sistem unic care aduce viață și dinamism poveștii",
    "",
    "Fiecare membru devine parte din legenda noastră, iar fiecare pas în regat te apropie de umbra care te alege.",
    "",
    "Tag: || @here || || @everyone ||",
    REGAT_RECRUITMENT_GIF_URL,
    `🔗${REGAT_INVITE_URL}`,
  ].join("\n");

export function allianceRecruitmentAnnouncementText(customText?: string): string {
  return (customText?.trim() || DEFAULT_ALLIANCE_RECRUITMENT_TEXT).slice(
    0,
    DISCORD_MESSAGE_MAX_LENGTH,
  );
}

export function allianceRecruitmentTextModal(currentText: string): ModalBuilder {
  const text = new TextInputBuilder()
    .setCustomId("alliance_recruitment_text")
    .setLabel("Textul mesajului de alianță")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(DISCORD_MESSAGE_MAX_LENGTH)
    .setValue(currentText.slice(0, DISCORD_MESSAGE_MAX_LENGTH));

  return new ModalBuilder()
    .setCustomId("alliance_recruitment_text_modal")
    .setTitle("Editează textul alianței")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(text));
}

export async function allianceRecruitmentTextForGuild(
  guildId: string,
): Promise<string> {
  const customText = await loadAllianceRecruitmentText(guildId);
  return allianceRecruitmentAnnouncementText(customText ?? undefined);
}

export function partnershipEditModal(
  userId: string,
  answers: Record<string, string>,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_alliance_edit_submit_${userId}`)
    .setTitle("Editează draftul alianței");
  const serverName = input("alliance_server_name", "Numele serverului", "Ex.: Regatul Umbrelor");
  const description = input(
    "alliance_description",
    "Descrierea serverului",
    "Descrieți serverul fără linkul de invitație.",
    TextInputStyle.Paragraph,
  );
  const invite = input("alliance_invite", "Linkul serverului", "https://discord.gg/...");
  const regatDescription = input(
    "alliance_regat_description",
    "Descrierea Regatului Cenușii",
    "Descrierea care va apărea în anunț.",
    TextInputStyle.Paragraph,
  );
  serverName.setValue(safeAnswer(answers.server_name, "", DISCORD_SHORT_INPUT_MAX_LENGTH));
  description.setValue(
    safeAnswer(answers.description, "", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
  );
  invite.setValue(safeAnswer(answers.invite, "", DISCORD_SHORT_INPUT_MAX_LENGTH));
  regatDescription.setValue(
    REGATUL_CENUSII_DESCRIPTION.slice(0, DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
  );
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(serverName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    new ActionRowBuilder<TextInputBuilder>().addComponents(invite),
    new ActionRowBuilder<TextInputBuilder>().addComponents(regatDescription),
  );
  return modal;
}

function fieldValue(interaction: ModalSubmitInteraction, id: string): string {
  return interaction.fields.getTextInputValue(id);
}

export function isStaffTagRefusal(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /^(nu|n|no)\b/.test(normalized) ||
    /\b(refuz|nu vreau|nu accept|nu pot|niciodata)\b/.test(normalized);
}

export function ticketQuestionModal(
  kind: OracleTicketKind,
  key: string,
  guildId?: string | null,
): ModalBuilder | null {
  const question = ticketQuestion(kind, key, guildId);
  if (!question) return null;

  return new ModalBuilder()
    .setCustomId(`ticket_answer_${kind}_${question.key}`)
    .setTitle(`${TICKET_LABELS[kind]} · Răspuns`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
           input(
          "answer",
          question.label.slice(0, 45),
          question.placeholder,
          question.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short,
           question.required !== false,
        ),
      ),
    );
}

export function isTicketPanelMessage(
  message: Message,
  botId: string,
  expectedKind?: OracleTicketKind,
): boolean {
  if (message.author.id !== botId) return false;
  const customIds = message.components.flatMap((row) => {
    if (!("components" in row)) return [];
    return row.components.flatMap((component) =>
      "customId" in component && typeof component.customId === "string"
        ? [component.customId]
        : [],
    );
  });
  const panelPattern = /^ticket_(?:start_(staff|partnership|help_report)|status_(staff|partnership|help_report)_(?:completed|rejected))$/;
  return message.components.some((row) => {
    if (!("components" in row)) return false;
    return row.components.some(
      (component) =>
        "customId" in component &&
        typeof component.customId === "string" &&
        panelPattern.test(component.customId) &&
        (!expectedKind || customIds.some((customId) =>
          customId === `ticket_start_${expectedKind}` ||
          customId.startsWith(`ticket_status_${expectedKind}_`),
        )),
    );
  });
}

async function lockTicketPanel(
  interaction: ModalSubmitInteraction,
  kind: OracleTicketKind,
  status: "completed" | "rejected",
): Promise<void> {
  const state = await getTicketProgress(interaction.channelId, interaction.user.id);
  if (!state?.panelMessageId || !interaction.channel?.isTextBased() || !("messages" in interaction.channel)) {
    return;
  }

  try {
    const panelMessage = await interaction.channel.messages.fetch(state.panelMessageId);
    await panelMessage.edit({ components: [ticketStatusRow(kind, status)] });
  } catch (err) {
    logger.warn(
      { err, channelId: interaction.channelId, panelMessageId: state.panelMessageId, status },
      "Could not lock completed ticket contract button",
    );
  }
}

function messageHasButton(message: Message | undefined, customId: string): boolean {
  if (!message) return false;
  return message.components.some((row) => {
    if (!("components" in row)) return false;
    return row.components.some(
      (component) => "customId" in component && component.customId === customId,
    );
  });
}

function actionMatchesResponseMessage(
  interaction: ButtonInteraction,
  responseMessageId: string | undefined,
): boolean {
  return Boolean(
    responseMessageId &&
      interaction.message?.id === responseMessageId,
  );
}

async function rejectTicketAction(
  interaction: ButtonInteraction,
  content: string,
): Promise<true> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleTicketQuestionSelect(
  interaction: StringSelectMenuInteraction,
): Promise<boolean> {
  const match = interaction.customId.match(/^ticket_questions_(staff|partnership|help_report)$/);
  if (!match) return false;

  const kind = match[1] as OracleTicketKind;
  const selectedKey = interaction.values[0] ?? "";
  const question = ticketQuestion(kind, selectedKey, interaction.guildId);
  const questions = ticketQuestions(interaction.guildId, kind);
  const state = await getTicketProgress(interaction.channelId, interaction.user.id);
  const expectedIndex = (state?.currentStep ?? 0) + 1;
  const selectedIndex = question
    ? questions.findIndex((entry) => entry.key === question.key) + 1
    : -1;
  if (!state || state.status || selectedIndex !== expectedIndex) {
    await interaction.reply({
      content: state?.status
        ? state.status === "completed"
          ? "✅ Contractul este deja completat."
          : "❌ Contractul a fost deja respins."
        : `⏳ Continuă cu pasul ${expectedIndex}/${questions.length}.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const modal = ticketQuestionModal(kind, selectedKey, interaction.guildId);
  if (!modal) {
    await interaction.reply({
      content: "❌ Întrebarea nu mai este disponibilă. Folosește meniul din nou.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.showModal(modal);
  return true;
}

export async function handleTicketButton(interaction: ButtonInteraction): Promise<boolean> {
  const rejectAllianceMatch = interaction.customId.match(/^ticket_alliance_reject_(\d+)$/);
  if (rejectAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member, getTicketConfig(interaction.guildId).staffReviewRoleId)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot refuza acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = rejectAllianceMatch[1]!;
    const state = await getTicketProgress(interaction.channelId, applicantId, true);
    if (
      !state?.answers ||
      state.status !== "completed" ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      await interaction.reply({
        content: "❌ Acest buton nu mai aparține rezumatului activ al contractului.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const rejectedState = await rejectTicketAlliance(interaction.channelId, applicantId);
    if (!rejectedState) {
      await interaction.reply({
        content: "❌ Pactul a fost deja publicat, refuzat sau este în curs de publicare.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    ticketProgress.set(ticketProgressKey(interaction.channelId, applicantId), rejectedState);
    await interaction.update({
      content: `❌ Pactul propus de <@${applicantId}> a fost refuzat de staff.`,
      embeds: [
        partnershipSummaryEmbed(
          rejectedState.applicantUsername ?? "Reprezentant",
          rejectedState.answers!,
          "REFUZAT · propunerea nu va fi publicată",
        )
          .setTitle("⛔ Contract de Parteneriat · Refuzat")
          .setColor(0x8f2d3d)
          .setFooter({ text: "Pact refuzat · Regatul Cenușii" }),
      ],
      components: [],
      allowedMentions: { parse: [], users: [applicantId] },
    });
    return true;
  }

  const confirmAllianceMatch = interaction.customId.match(/^ticket_alliance_confirm_(\d+)$/);
  if (confirmAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member, getTicketConfig(interaction.guildId).staffReviewRoleId)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot confirma acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = confirmAllianceMatch[1]!;
    const state = await getTicketProgress(interaction.channelId, applicantId, true);
    if (
      !state?.answers ||
      state.status !== "completed" ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      await interaction.reply({
        content: "❌ Acest buton nu mai aparține rezumatului activ al contractului.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (state.alliancePosted) {
      await interaction.reply({
        content: "✅ Alianța a fost deja publicată.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.update({
      embeds: [
        partnershipDraftEmbed(state.applicantUsername ?? "Reprezentant", state.answers),
      ],
      components: [partnershipPublishRow(applicantId)],
    });
    return true;
  }

  const postAllianceMatch = interaction.customId.match(/^ticket_alliance_post_(\d+)$/);
  if (postAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member, getTicketConfig(interaction.guildId).staffReviewRoleId)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot publica acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = postAllianceMatch[1]!;
    const state = await getTicketProgress(interaction.channelId, applicantId, true);
    if (
      !state?.answers ||
      state.status !== "completed" ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      await interaction.reply({
        content: "❌ Acest buton nu mai aparține rezumatului activ al contractului.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "🛡️ Doar stafful cu permisiunea de gestionare a canalelor poate publica pactul.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (state.alliancePosted) {
      await interaction.reply({
        content: "✅ Alianța a fost deja publicată.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (state.alliancePublishing) {
      await interaction.reply({
        content: "⏳ Publicarea alianței este deja în curs. Așteaptă confirmarea rezultatului.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const ticketConfig = getTicketConfig(interaction.guildId);
    if (interaction.guildId !== ticketConfig.allianceOwnerGuildId) {
      await interaction.reply({
        content:
          "❌ Publicarea alianțelor nu este configurată pentru acest server. " +
          "Destinația este disponibilă doar în serverul Regatului Cenușii.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const publicChannel = await interaction.client.channels
      .fetch(ticketConfig.alliancePublicChannelId)
      .catch(() => null);
    const fetchedGuildId =
      publicChannel &&
      typeof publicChannel === "object" &&
      "guildId" in publicChannel &&
      typeof publicChannel.guildId === "string"
        ? publicChannel.guildId
        : null;
    if (
      !publicChannel?.isTextBased() ||
      !("send" in publicChannel) ||
      fetchedGuildId !== interaction.guildId
    ) {
      await interaction.reply({
        content:
          `❌ Canalul alianțelor (<#${ticketConfig.alliancePublicChannelId}>) ` +
          "nu este disponibil sau nu aparține serverului Regatului Cenușii.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const claimedState = await claimTicketAlliancePublication(
      interaction.channelId,
      applicantId,
    );
    if (!claimedState) {
      const currentState = await getTicketProgress(interaction.channelId, applicantId, true);
      await interaction.reply({
        content: currentState?.alliancePosted
          ? "✅ Alianța a fost deja publicată."
          : "⏳ Publicarea alianței este deja în curs. Așteaptă confirmarea rezultatului.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    ticketProgress.set(ticketProgressKey(interaction.channelId, applicantId), claimedState);

    let announcementSent = false;
    try {
      const inviteStats = await fetchAllianceInviteStats(
        interaction.client,
        claimedState.answers?.invite,
      );
      const announcementText = allianceAnnouncementText(
        claimedState.answers!,
        claimedState.applicantUsername ?? "Reprezentant",
        applicantId,
        ticketConfig.allianceAnnouncementTemplate,
        inviteStats,
      );
      const announcementImageEmbed = allianceAnnouncementImageEmbed(
        ticketConfig.allianceAnnouncementImageUrl,
        ticketConfig.allianceAnnouncementImageMode,
        ticketConfig.allianceAnnouncementThumbnailUrl,
      );
      const publicMessage = await publicChannel.send({
        ...(ticketConfig.allianceAnnouncementMode === "embed"
          ? {
              embeds: [
                allianceAnnouncementEmbed(
                  announcementText,
                  ticketConfig.allianceAnnouncementImageUrl,
                  ticketConfig.allianceAnnouncementImageMode,
                  ticketConfig.allianceAnnouncementThumbnailUrl,
                ),
              ],
            }
          : {
              content: announcementText,
              ...(announcementImageEmbed ? { embeds: [announcementImageEmbed] } : {}),
            }),
        allowedMentions: { parse: [], users: [applicantId] },
      });
      announcementSent = true;
      const finishedState = await finishTicketAlliancePublication(
        interaction.channelId,
        applicantId,
        publicMessage.id,
      );
      if (!finishedState) {
        throw new Error("Alliance publication claim was lost before it could be finalized");
      }
      ticketProgress.set(ticketProgressKey(interaction.channelId, applicantId), finishedState);
      await interaction.update({
        content: `✅ Alianța a fost aprobată și publicată în <#${ticketConfig.alliancePublicChannelId}>.`,
        embeds: [
          partnershipPublishedEmbed(
            finishedState.applicantUsername ?? "Reprezentant",
            finishedState.answers!,
          ),
        ],
        components: [],
        allowedMentions: { parse: [] },
      });
      await interaction.followUp({
        content: "✅ Pactul a fost publicat în canalul alianțelor.",
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error(
        {
          err,
          channelId: interaction.channelId,
          publicChannelId: ticketConfig.alliancePublicChannelId,
        },
        "Alliance announcement could not be published",
      );
      if (!announcementSent) {
        const releasedState = await releaseTicketAlliancePublication(
          interaction.channelId,
          applicantId,
        ).catch(() => null);
        if (releasedState) {
          ticketProgress.set(ticketProgressKey(interaction.channelId, applicantId), releasedState);
        }
      }
      await interaction.reply({
        content: "❌ Pactul nu a putut fi publicat. Verifică permisiunile botului în canalul alianțelor.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  const editAllianceMatch = interaction.customId.match(/^ticket_alliance_edit_(\d+)$/);
  if (editAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member, getTicketConfig(interaction.guildId).staffReviewRoleId)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot edita acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const applicantId = editAllianceMatch[1]!;
    const state = await getTicketProgress(interaction.channelId, applicantId, true);
    if (
      !state?.answers ||
      state.alliancePosted ||
      state.alliancePublishing ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      await interaction.reply({
        content: "❌ Acest buton nu mai aparține draftului activ.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(partnershipEditModal(applicantId, state.answers));
    return true;
  }

  if (interaction.customId === "ticket_copy_partnership") {
    await interaction.reply({
      content: "📋 Copierea simplă nu mai este disponibilă. Folosește **Confirmă alianța** pentru a crea draftul de publicare.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return true;
  }

  const startMatch = interaction.customId.match(/^ticket_start_(staff|partnership|help_report)$/);
  if (startMatch) {
    const kind = startMatch[1] as OracleTicketKind;
    const flow = ticketFlow(interaction.guildId, kind);
    if (!messageHasButton(interaction.message, interaction.customId)) {
      return rejectTicketAction(
        interaction,
        "❌ Acest buton nu mai aparține panoului activ al ticketului.",
      );
    }
    const existingProgress = await getTicketProgress(interaction.channelId, interaction.user.id);
    if (existingProgress?.status) {
      await interaction.reply({
        content:
          existingProgress.status === "completed"
            ? "✅ Contractul este deja completat."
            : "❌ Contractul a fost deja respins.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (existingProgress && existingProgress.currentStep > 0) {
      return rejectTicketAction(
        interaction,
        "⏳ Contractul tău este deja în desfășurare. Continuă de la pasul curent.",
      );
    }
    await persistTicketProgress(interaction.channelId, interaction.user.id, {
      currentStep: 0,
      panelMessageId: interaction.message.id,
      applicantUsername: interaction.user.globalName ?? interaction.user.username,
    });
    if (flow.mode === "custom") {
      const firstQuestion = ticketQuestions(interaction.guildId, kind)[0];
      if (!firstQuestion) return false;
      await interaction.showModal(ticketQuestionModal(kind, firstQuestion.key, interaction.guildId)!);
      return true;
    }
    if (kind === "staff" || kind === "partnership") {
      void interaction.message.edit(
          ticketPanelPayload(
          kind,
          ticketDeadlineForChannel(interaction.channel),
            interaction.guildId,
        ),
      ).catch(() => null);
      await interaction.showModal(ticketModal(kind));
      return true;
    }

    const firstQuestion = TICKET_QUESTIONS[kind][0];
    if (!firstQuestion) return false;
    await interaction.showModal(ticketQuestionModal(kind, firstQuestion.key)!);
    return true;
  }

  const nextMatch = interaction.customId.match(/^ticket_next_(staff|partnership|help_report)_(\d+)$/);
  if (nextMatch) {
    const kind = nextMatch[1] as OracleTicketKind;
    const questionIndex = Number(nextMatch[2]);
    const question = ticketQuestions(interaction.guildId, kind)[questionIndex - 1];
    const progressState = await getTicketProgress(interaction.channelId, interaction.user.id, true);
    if (progressState?.status) {
      await interaction.reply({
        content:
          progressState.status === "completed"
            ? "✅ Contractul este deja completat."
            : "❌ Contractul a fost deja respins.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const expectedIndex = (progressState?.currentStep ?? 0) + 1;
    if (
      !progressState ||
      !question ||
      questionIndex !== expectedIndex ||
      !actionMatchesResponseMessage(interaction, progressState.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      await interaction.reply({
        content: `⏳ Continuă cu pasul ${expectedIndex}/${ticketQuestions(interaction.guildId, kind).length}.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.showModal(ticketQuestionModal(kind, question.key, interaction.guildId)!);
    return true;
  }

  if (interaction.customId === "ticket_staff_continue") {
    const state = await getTicketProgress(interaction.channelId, interaction.user.id);
    if (
      !state ||
      state.status ||
      state.currentStep !== 5 ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      return rejectTicketAction(
        interaction,
        "❌ Continuarea nu mai aparține primei pagini a contractului tău.",
      );
    }
    await interaction.showModal(staffDetailsModal());
    return true;
  }
  if (interaction.customId === "ticket_partnership_continue") {
    const state = await getTicketProgress(interaction.channelId, interaction.user.id);
    if (
      !state ||
      state.status ||
      state.currentStep !== 5 ||
      !actionMatchesResponseMessage(interaction, state.responseMessageId) ||
      !messageHasButton(interaction.message, interaction.customId)
    ) {
      return rejectTicketAction(
        interaction,
        "❌ Continuarea nu mai aparține primei pagini a contractului tău.",
      );
    }
    await interaction.showModal(partnershipDetailsModal());
    return true;
  }

  const match = interaction.customId.match(/^ticket_(start|requirements)_(staff|partnership|help_report)$/);
  if (!match) return false;
  const kind = match[2] as OracleTicketKind;

  if (match[1] === "requirements") {
    await interaction.reply({
      embeds: [ticketRequirementsEmbed(kind, interaction.guildId)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.showModal(ticketModal(kind));
  return true;
}

export async function handleTicketQuestionModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const match = interaction.customId.match(/^ticket_answer_(staff|partnership|help_report)_(.+)$/);
  if (!match) return false;

  const kind = match[1] as OracleTicketKind;
  const question = ticketQuestion(kind, match[2]!, interaction.guildId);
  if (!question) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const answer = safeAnswer(
    fieldValue(interaction, "answer"),
    "—",
    question.multiline
      ? DISCORD_PARAGRAPH_INPUT_MAX_LENGTH
      : DISCORD_SHORT_INPUT_MAX_LENGTH,
  );
  const questions = ticketQuestions(interaction.guildId, kind);
  const flow = ticketFlow(interaction.guildId, kind);
  const questionIndex = questions.findIndex((entry) => entry.key === question.key) + 1;
  const totalQuestions = questions.length;
  const isLastQuestion = questionIndex === totalQuestions;
  const progressState = await getTicketProgress(interaction.channelId, interaction.user.id);
  const expectedIndex = (progressState?.currentStep ?? 0) + 1;
  if (!progressState || progressState.status) {
    await interaction.editReply({
      content: progressState?.status === "completed"
        ? "✅ Contractul este deja completat."
        : progressState?.status === "rejected"
          ? "❌ Contractul a fost deja respins."
          : "❌ Sesiunea acestui contract nu mai este disponibilă. Pornește formularul din nou.",
    });
    return true;
  }
  if (questionIndex !== expectedIndex) {
    await interaction.editReply({
      content:
        `⏳ Acesta este pasul ${questionIndex}, dar contractul așteaptă ` +
        `pasul ${expectedIndex}/${totalQuestions}.`,
    });
    return true;
  }
  progressState.answers = {
    ...(progressState.answers ?? {}),
    [question.key]: answer,
  };
  if (flow.mode === "custom") {
    const complete = questionIndex === totalQuestions;
    if (!interaction.channel || !interaction.channel.isTextBased() || !("send" in interaction.channel)) {
      await interaction.editReply({ content: "❌ Răspunsul nu a putut fi publicat în acest ticket." });
      return true;
    }
    try {
      if (complete && kind === "partnership") {
        const partnershipAnswers = partnershipAnswersForCustomFlow(
          flow,
          progressState.answers ?? {},
        );
        const roleId = getTicketConfig(interaction.guildId).staffReviewRoleId;
        const summaryEmbed = partnershipSummaryEmbed(
          interaction.user.globalName ?? interaction.user.username,
          partnershipAnswers,
          undefined,
          false,
        );
        const summaryEmbeds = privateQuestionSummaryEmbeds(summaryEmbed, questions, progressState.answers);
        setTicketMedia(summaryEmbeds.at(-1)!, flow.staffNotificationImageUrl, flow.staffNotificationThumbnailUrl);
        const responseMessage = await sendPrivateSummary(interaction.channel, summaryEmbeds, {
          content: `<@&${roleId}>\n${flow.staffNotificationMessage}`,
          components: [partnershipConfirmRow(interaction.user.id)],
          allowedMentions: { parse: [], roles: [roleId] },
        });
        progressState.currentStep = questionIndex;
        progressState.status = "completed";
        progressState.answers = partnershipAnswers;
        const previousMessageId = progressState.responseMessageId;
        progressState.responseMessageId = responseMessage.id;
        await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
        await removePreviousContinuation(interaction, previousMessageId);
        await lockTicketPanel(interaction, kind, "completed");
        const completionMediaEmbed =
          publicTicketImageUrl(flow.completionImageUrl) || publicTicketImageUrl(flow.completionThumbnailUrl)
            ? new EmbedBuilder().setColor(TICKET_COLORS[kind])
            : null;
        if (completionMediaEmbed) {
          setTicketMedia(completionMediaEmbed, flow.completionImageUrl, flow.completionThumbnailUrl);
        }
        if (completionMediaEmbed) await interaction.channel.send({ embeds: [completionMediaEmbed] });
        await dismissTicketSuccess(interaction);
        return true;
      }
      const flowEmbed = new EmbedBuilder()
        .setColor(TICKET_COLORS[kind])
        .setTitle(complete ? `${TICKET_ICONS[kind]} Formular complet` : `${TICKET_ICONS[kind]} Răspuns înregistrat`)
        .setDescription(complete ? flow.completionMessage : question.description)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          complete
            ? []
            : [
                { name: "🧾 Întrebarea", value: question.description, inline: false },
                { name: "✍️ Răspunsul", value: answer, inline: false },
                { name: "📈 Progresul", value: `${questionIndex}/${totalQuestions}`, inline: false },
              ],
        )
        .setFooter({ text: complete ? "Formular complet · Regatul Cenușii" : "Răspunsul a fost salvat" })
        .setTimestamp();
      if (TICKET_SEAL) flowEmbed.setThumbnail(TICKET_SEAL);
      setTicketMedia(
        flowEmbed,
        complete ? flow.completionImageUrl : question.imageUrl,
        complete ? flow.completionThumbnailUrl : question.thumbnailUrl,
      );

      const roleId = getTicketConfig(interaction.guildId).staffReviewRoleId;
      const notifyStaff = complete && flow.completionAction === "notify_staff";
      const staffMediaEmbed = notifyStaff &&
        (publicTicketImageUrl(flow.staffNotificationImageUrl) || publicTicketImageUrl(flow.staffNotificationThumbnailUrl))
        ? new EmbedBuilder().setColor(TICKET_COLORS[kind])
        : null;
      if (staffMediaEmbed) {
        setTicketMedia(staffMediaEmbed, flow.staffNotificationImageUrl, flow.staffNotificationThumbnailUrl);
      }
      const summaryEmbeds = complete
        ? privateQuestionSummaryEmbeds(flowEmbed, questions, progressState.answers ?? {})
        : [flowEmbed];
      const nextComponents = !complete
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket_next_${kind}_${questionIndex + 1}`)
              .setLabel(`➡️ Continuă · ${questionIndex + 1}/${totalQuestions}`)
              .setStyle(ButtonStyle.Primary),
          )]
        : [];
      const responseMessage = await sendPrivateSummary(interaction.channel, summaryEmbeds, {
        content: notifyStaff ? `<@&${roleId}>\n${flow.staffNotificationMessage}` : undefined,
        components: nextComponents,
        allowedMentions: notifyStaff ? { parse: [], roles: [roleId] } : { parse: [] },
      });
      if (staffMediaEmbed) await interaction.channel.send({ embeds: [staffMediaEmbed] });
      progressState.currentStep = questionIndex;
      if (complete) progressState.status = "completed";
      const previousMessageId = progressState.responseMessageId;
      progressState.responseMessageId = responseMessage.id;
      await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
      await removePreviousContinuation(interaction, previousMessageId);
      if (complete) {
        await lockTicketPanel(interaction, kind, "completed");
      }
      await dismissTicketSuccess(interaction);
    } catch (err) {
      logger.error({ err, guildId: interaction.guildId, channelId: interaction.channelId }, "Custom ticket answer could not be posted");
      await interaction.editReply({ content: "❌ Răspunsul nu a putut fi adăugat în ticket. Încearcă din nou." });
    }
    return true;
  }
  const partnershipAnswers = {
    ...(progressState.answers ?? {}),
    [question.key]: answer,
  };
  const rejectedForTag =
    kind === "staff" &&
    question.key === "server_tag" &&
    isStaffTagRefusal(answer);
  const answerEmbed = new EmbedBuilder()
    .setColor(rejectedForTag ? 0xc0392b : TICKET_COLORS[kind])
    .setTitle(
      rejectedForTag
        ? "❌ Aplicare respinsă"
        : isLastQuestion
        ? `${TICKET_ICONS[kind]} Formular complet`
        : `${TICKET_ICONS[kind]} Răspuns înregistrat`,
    )
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      rejectedForTag
        ? "Oracolul Cenușii a respins aplicația. Purtarea tag-ului serverului este o condiție obligatorie pentru staff."
        : isLastQuestion
        ? "Toate răspunsurile din formular au fost adăugate. Echipa poate începe evaluarea aplicației."
        : "Răspunsul tău a fost adăugat în acest ticket. Poți continua din meniul de întrebări.",
    )
    .addFields(
      { name: "🧾 Întrebarea contractului", value: question.description, inline: false },
      { name: "✍️ Răspunsul înregistrat", value: answer, inline: false },
      {
        name: rejectedForTag ? "⚖️ Verdictul Oracolului" : "📈 Progresul contractului",
        value: rejectedForTag
          ? "RESPINS · Condiția obligatorie privind tag-ul nu a fost acceptată."
          : isLastQuestion
          ? `✅ ${totalQuestions}/${totalQuestions} · Formular complet`
          : `◆ Pasul ${questionIndex}/${totalQuestions} · Alege următoarea întrebare din meniu`,
        inline: false,
      },
    )
    .setFooter({
      text: rejectedForTag
        ? "Decizie automată · Contractul de staff nu poate continua"
        : isLastQuestion
        ? "Aplicația este pregătită pentru evaluarea staffului"
        : "Regatul Cenușii · Răspunsurile rămân în acest ticket",
    })
    .setTimestamp();
  if (TICKET_SEAL) answerEmbed.setThumbnail(TICKET_SEAL);

  if (
    !interaction.channel ||
    !interaction.channel.isTextBased() ||
    !("send" in interaction.channel)
  ) {
    await interaction.editReply({
      content: "❌ Răspunsul nu a putut fi publicat în acest ticket. Încearcă din nou.",
    });
    return true;
  }

  try {
    const finalPartnership = kind === "partnership" && isLastQuestion;
    const nextComponents = !rejectedForTag && !isLastQuestion
      ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_next_${kind}_${questionIndex + 1}`)
            .setLabel(`➡️ Continuă contractul · ${questionIndex + 1}/${totalQuestions}`)
            .setStyle(ButtonStyle.Primary),
        )]
      : [];
    const finalEmbeds = isLastQuestion && !finalPartnership
      ? privateQuestionSummaryEmbeds(answerEmbed, questions, partnershipAnswers)
      : [finalPartnership
          ? partnershipSummaryEmbed(interaction.user.globalName ?? interaction.user.username, partnershipAnswers)
          : answerEmbed];
    const responseMessage = await sendPrivateSummary(interaction.channel, finalEmbeds, {
      content: finalPartnership
        ? allianceStaffNotificationText(
            interaction.user.globalName ?? interaction.user.username,
            getTicketConfig(interaction.guildId).staffReviewRoleId,
          )
        : undefined,
      components: finalPartnership
        ? [partnershipConfirmRow(interaction.user.id)]
        : nextComponents,
      allowedMentions: finalPartnership
        ? { parse: [], roles: [getTicketConfig(interaction.guildId).staffReviewRoleId] }
        : { parse: [] },
    });
    const previousMessageId = progressState.responseMessageId;
    progressState.responseMessageId = responseMessage.id;
    if (rejectedForTag || isLastQuestion) {
      progressState.currentStep = questionIndex;
      progressState.status = rejectedForTag ? "rejected" : "completed";
      await lockTicketPanel(
        interaction,
        kind,
        rejectedForTag ? "rejected" : "completed",
      );
    } else {
      progressState.currentStep = questionIndex;
    }
    await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
    await removePreviousContinuation(interaction, previousMessageId);
    await dismissTicketSuccess(interaction);
  } catch (err) {
    logger.error(
      { err, guildId: interaction.guildId, channelId: interaction.channelId, ticketKind: kind },
      "Ticket question answer could not be posted",
    );
    await interaction.editReply({
      content: "❌ Răspunsul nu a putut fi adăugat în ticket. Încearcă din nou.",
    });
  }
  return true;
}

export async function handleTicketModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const editAllianceMatch = interaction.customId.match(/^ticket_form_alliance_edit_submit_(\d+)$/);
  if (editAllianceMatch) {
    if (!memberHasStaffReviewRole(interaction.member, getTicketConfig(interaction.guildId).staffReviewRoleId)) {
      await interaction.reply({
        content: "🛡️ Doar membrii cu rolul de staff al alianțelor pot edita acest pact.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const applicantId = editAllianceMatch[1]!;
    const state = await getTicketProgress(interaction.channelId, applicantId, true);
    if (!state?.answers || state.alliancePosted || state.alliancePublishing) {
      await interaction.editReply({ content: "❌ Acest draft nu mai poate fi editat." });
      return true;
    }

    const answers = {
      ...state.answers,
      server_name: safeAnswer(fieldValue(interaction, "alliance_server_name")),
      description: safeAnswer(fieldValue(interaction, "alliance_description")),
      invite: safeAnswer(fieldValue(interaction, "alliance_invite")),
      regat_description: safeAnswer(fieldValue(interaction, "alliance_regat_description")),
    };

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("messages" in interaction.channel) ||
      !state.responseMessageId
    ) {
      await interaction.editReply({
        content: "❌ Draftul nu mai este disponibil pentru editare în acest ticket.",
      });
      return true;
    }

    const responseMessage = await interaction.channel.messages
      .fetch(state.responseMessageId)
      .catch(() => null);
    if (!responseMessage) {
      await interaction.editReply({
        content: "❌ Mesajul draftului nu mai este disponibil.",
      });
      return true;
    }
    await responseMessage.edit({
      embeds: [
        partnershipDraftEmbed(state.applicantUsername ?? "Reprezentant", answers),
      ],
      components: [partnershipPublishRow(applicantId)],
    });
    state.answers = answers;
    await persistTicketProgress(interaction.channelId, applicantId, state);
    await interaction.editReply({ content: "✅ Draftul alianței a fost actualizat." });
    return true;
  }

  if (interaction.customId === "ticket_form_partnership_details") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const progressState = await getTicketProgress(interaction.channelId, interaction.user.id);
    if (
      !progressState ||
      progressState.status ||
      progressState.currentStep !== TICKET_QUESTIONS.partnership.length - 3
    ) {
      await interaction.editReply({
        content:
          "❌ Prima pagină a contractului nu este validă sau a fost deja folosită. " +
          "Reia contractul din panoul ticketului.",
      });
      return true;
    }

    const firstAnswers = progressState.answers ?? {};
    const finalAnswers = {
      ...firstAnswers,
      motivation: safeAnswer(fieldValue(interaction, "partnership_motivation")),
      offer: safeAnswer(fieldValue(interaction, "partnership_offer")),
      terms: safeAnswer(fieldValue(interaction, "partnership_terms")),
    };
    const finalEmbed = partnershipSummaryEmbed(
      interaction.user.globalName ?? interaction.user.username,
      finalAnswers,
    );

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("send" in interaction.channel)
    ) {
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi publicate în ticket.",
      });
      return true;
    }

    try {
      let mergedIntoFirstResponse = false;
      if (progressState.responseMessageId && "messages" in interaction.channel) {
        const firstResponse = await interaction.channel.messages
          .fetch(progressState.responseMessageId)
          .catch(() => null);
        if (firstResponse) {
          await firstResponse.edit({
            content: allianceStaffNotificationText(
              interaction.user.globalName ?? interaction.user.username,
              getTicketConfig(interaction.guildId).staffReviewRoleId,
            ),
            embeds: [finalEmbed],
            components: [partnershipConfirmRow(interaction.user.id)],
            allowedMentions: { parse: [], roles: [getTicketConfig(interaction.guildId).staffReviewRoleId] },
          });
          mergedIntoFirstResponse = true;
        }
      }
      if (!mergedIntoFirstResponse) {
        const responseMessage = await interaction.channel.send({
          content: allianceStaffNotificationText(
            interaction.user.globalName ?? interaction.user.username,
            getTicketConfig(interaction.guildId).staffReviewRoleId,
          ),
          embeds: [finalEmbed],
          components: [partnershipConfirmRow(interaction.user.id)],
          allowedMentions: { parse: [], roles: [getTicketConfig(interaction.guildId).staffReviewRoleId] },
        });
        progressState.responseMessageId = responseMessage.id;
      }
      progressState.answers = finalAnswers;
      progressState.currentStep = TICKET_QUESTIONS.partnership.length;
      progressState.status = "completed";
      await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
      await lockTicketPanel(interaction, "partnership", "completed");
      await dismissTicketSuccess(interaction);
    } catch (err) {
      logger.error(
        { err, guildId: interaction.guildId, channelId: interaction.channelId },
        "Final partnership application step could not be posted",
      );
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi adăugate în ticket.",
      });
    }
    return true;
  }

  if (interaction.customId === "ticket_form_staff_details") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const progressState = await getTicketProgress(interaction.channelId, interaction.user.id);
    if (
      !progressState ||
      progressState.status ||
      progressState.currentStep !== TICKET_QUESTIONS.staff.length - 3
    ) {
      await interaction.editReply({
        content:
          "❌ Prima pagină a contractului nu este validă sau a fost deja folosită. " +
          "Reia contractul din panoul ticketului.",
      });
      return true;
    }
    const tagAnswer = safeAnswer(
      fieldValue(interaction, "staff_tag"),
      "—",
      DISCORD_SHORT_INPUT_MAX_LENGTH,
    );
    const rejectedForTag = isStaffTagRefusal(tagAnswer);
    const firstAnswers = progressState.answers ?? {};
    const finalEmbed = new EmbedBuilder()
      .setColor(rejectedForTag ? 0x8f2d3d : 0xc29a52)
      .setTitle(
        rejectedForTag
          ? "⛔ Contract Staff · Respins automat"
          : "📜 Contract Staff · Rezumat pentru evaluare",
      )
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setDescription(
        rejectedForTag
          ? "Contractul nu poate continua deoarece purtarea tag-ului serverului nu a fost acceptată."
          : "Cele opt răspunsuri sunt reunite într-un singur rezumat și așteaptă verificarea staffului.",
      )
      .addFields(
        {
          name: "👤 Nume",
          value: safeAnswer(firstAnswers.name, "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
          inline: true,
        },
        {
          name: "🎂 Vârstă",
          value: safeAnswer(firstAnswers.age, "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
          inline: true,
        },
        {
          name: "⚔️ Experiență în moderare",
          value: safeAnswer(firstAnswers.moderation),
          inline: false,
        },
        {
          name: "🕰️ Timp disponibil",
          value: safeAnswer(
            firstAnswers.availability,
            "—",
            DISCORD_SHORT_INPUT_MAX_LENGTH,
          ),
          inline: true,
        },
        {
          name: "🔥 Motivație",
          value: safeAnswer(firstAnswers.motivation),
          inline: false,
        },
        {
          name: "🛡️ Gestionarea unui conflict",
          value: safeAnswer(
            fieldValue(interaction, "staff_conflict"),
            "—",
            DISCORD_PARAGRAPH_INPUT_MAX_LENGTH,
          ),
          inline: false,
        },
        {
          name: "🏰 Îmbunătățiri propuse",
          value: safeAnswer(
            fieldValue(interaction, "staff_improvements"),
            "—",
            DISCORD_PARAGRAPH_INPUT_MAX_LENGTH,
          ),
          inline: false,
        },
        {
          name: "🏷️ Tag-ul serverului",
          value: tagAnswer,
          inline: true,
        },
      )
      .addFields({
        name: rejectedForTag ? "⚖️ Verdict" : "📊 Starea dosarului",
        value: rejectedForTag
          ? "RESPINS AUTOMAT · condiția tag-ului nu a fost acceptată."
          : `COMPLET · trimis către <@&${getTicketConfig(interaction.guildId).staffReviewRoleId}> pentru decizia finală.`,
        inline: false,
      })
      .setFooter({
        text: rejectedForTag
          ? "Decizie automată · Contractul de staff nu poate continua"
          : "Aplicație completă · Așteaptă evaluarea staffului",
      })
      .setTimestamp();

    if (
      !interaction.channel ||
      !interaction.channel.isTextBased() ||
      !("send" in interaction.channel)
    ) {
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi publicate. Încearcă din nou în ticket.",
      });
      return true;
    }

    try {
      let mergedIntoFirstResponse = false;
      if (progressState?.responseMessageId && "messages" in interaction.channel) {
        const firstResponse = await interaction.channel.messages
          .fetch(progressState.responseMessageId)
          .catch(() => null);
        if (firstResponse) {
          await firstResponse.edit({
            embeds: [finalEmbed],
            components: [],
            allowedMentions: { parse: [] },
          });
          mergedIntoFirstResponse = true;
        }
      }
      if (!mergedIntoFirstResponse) {
        await interaction.channel.send({
          embeds: [finalEmbed],
          allowedMentions: { parse: [] },
        });
      }
      if (progressState) {
        progressState.currentStep = TICKET_QUESTIONS.staff.length;
        progressState.status = rejectedForTag ? "rejected" : "completed";
        await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
      }
      await lockTicketPanel(
        interaction,
        "staff",
        rejectedForTag ? "rejected" : "completed",
      );
      if (!rejectedForTag) {
        await interaction.channel.send(
          staffOracleReviewPayload(
            interaction.user.username,
            getTicketConfig(interaction.guildId).staffReviewRoleId,
          ),
        );
      }
      await dismissTicketSuccess(interaction);
    } catch (err) {
      logger.error(
        { err, guildId: interaction.guildId, channelId: interaction.channelId },
        "Final staff application step could not be posted",
      );
      await interaction.editReply({
        content: "❌ Ultimele răspunsuri nu au putut fi adăugate în ticket. Încearcă din nou.",
      });
    }
    return true;
  }

  const match = interaction.customId.match(/^ticket_form_(staff|partnership|help_report)$/);
  if (!match) return false;
  const kind = match[1] as OracleTicketKind;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const initialState = await getTicketProgress(interaction.channelId, interaction.user.id);
  if (
    !initialState ||
    initialState.status ||
    initialState.currentStep !== 0
  ) {
    await interaction.editReply({
      content: initialState?.status === "completed"
        ? "✅ Contractul este deja completat."
        : initialState?.status === "rejected"
          ? "❌ Contractul a fost deja respins."
          : "❌ Sesiunea contractului nu este validă. Pornește formularul din panoul ticketului.",
    });
    return true;
  }
  const color = TICKET_COLORS[kind];
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${TICKET_ICONS[kind]} ${TICKET_LABELS[kind]} · Pagina 1/2`)
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setDescription(
      kind === "help_report"
        ? "Prima declarație a fost trimisă în acest ticket și poate fi verificată de staff."
        : "Prima pagină a contractului a fost trimisă. Continuă cu ultimele întrebări.",
    )
    .setFooter({ text: "Nu închide ticketul până când stafful nu revine" })
    .setTimestamp();

  if (kind === "staff") {
    embed.addFields(
       { name: "👤 Nume", value: safeAnswer(fieldValue(interaction, "staff_name"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "🎂 Vârstă", value: safeAnswer(fieldValue(interaction, "staff_age"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "⚔️ Experiență", value: safeAnswer(fieldValue(interaction, "staff_experience"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH), inline: false },
       { name: "🕰️ Disponibilitate", value: safeAnswer(fieldValue(interaction, "staff_availability"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "🔥 Motivație", value: safeAnswer(fieldValue(interaction, "staff_motivation"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH), inline: false },
      {
         name: "🧭 Următorul pas",
         value: "Apasă **Continuă aplicația** pentru conflicte, îmbunătățiri și acceptarea tag-ului.",
        inline: false,
      },
    );
  } else if (kind === "partnership") {
    embed.addFields(
       { name: "🏰 Server", value: safeAnswer(fieldValue(interaction, "partnership_name"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
      {
         name: "👤 Reprezentant",
         value: safeAnswer(fieldValue(interaction, "partnership_representative"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
        inline: true,
      },
       { name: "👥 Membri și activitate", value: safeAnswer(fieldValue(interaction, "partnership_members"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "📝 Descrierea serverului", value: safeAnswer(fieldValue(interaction, "partnership_description"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH), inline: false },
       { name: "🔗 Invitație / link", value: safeAnswer(fieldValue(interaction, "partnership_invite"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: false },
      {
         name: "🧭 Următorul pas",
         value: "Apasă **Continuă propunerea** pentru motivul alianței, ofertă și regulile pactului.",
        inline: false,
      },
    );
  } else {
    embed.addFields(
       { name: "🕯️ Tipul solicitării", value: safeAnswer(fieldValue(interaction, "help_type"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "👤 Membru raportat", value: safeAnswer(fieldValue(interaction, "help_target"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "📝 Descriere", value: safeAnswer(fieldValue(interaction, "help_description"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH), inline: false },
       { name: "🕰️ Moment", value: safeAnswer(fieldValue(interaction, "help_when"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH), inline: true },
       { name: "🔎 Dovezi", value: safeAnswer(fieldValue(interaction, "help_evidence"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH), inline: false },
    );
  }

  if (
    !interaction.channel ||
    !interaction.channel.isTextBased() ||
    !("send" in interaction.channel)
  ) {
    await interaction.editReply({
      content: "❌ Formularul nu a putut fi publicat în acest canal. Încearcă din nou în ticket.",
    });
    return true;
  }

  try {
    const components =
      kind === "staff"
        ? [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId("ticket_staff_continue")
                .setLabel("⚔️ Continuă aplicația")
                .setStyle(ButtonStyle.Primary),
            ),
          ]
        : kind === "partnership"
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId("ticket_partnership_continue")
                   .setLabel("🤝 Continuă contractul")
                  .setStyle(ButtonStyle.Primary),
              ),
            ]
        : [];
    const responseMessage = await interaction.channel.send({
      embeds: [embed],
      components,
      allowedMentions: { parse: [] },
    });
    if (kind === "staff" || kind === "partnership") {
      const progressState = await getTicketProgress(interaction.channelId, interaction.user.id);
      if (progressState) {
        progressState.currentStep = 5;
        progressState.responseMessageId = responseMessage.id;
        progressState.answers =
          kind === "staff"
            ? {
                name: safeAnswer(fieldValue(interaction, "staff_name"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                age: safeAnswer(fieldValue(interaction, "staff_age"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                moderation: safeAnswer(fieldValue(interaction, "staff_experience"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
                availability: safeAnswer(fieldValue(interaction, "staff_availability"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                motivation: safeAnswer(fieldValue(interaction, "staff_motivation"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
              }
            : {
                server_name: safeAnswer(fieldValue(interaction, "partnership_name"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                representative: safeAnswer(
                  fieldValue(interaction, "partnership_representative"),
                  "—",
                  DISCORD_SHORT_INPUT_MAX_LENGTH,
                ),
                invite: safeAnswer(fieldValue(interaction, "partnership_invite"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                members: safeAnswer(fieldValue(interaction, "partnership_members"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
                description: safeAnswer(
                  fieldValue(interaction, "partnership_description"),
                  "—",
                  DISCORD_PARAGRAPH_INPUT_MAX_LENGTH,
                ),
              };
        await persistTicketProgress(interaction.channelId, interaction.user.id, progressState);
      }
    } else {
      initialState.answers = {
        type: safeAnswer(fieldValue(interaction, "help_type"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
        target: safeAnswer(fieldValue(interaction, "help_target"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
        description: safeAnswer(fieldValue(interaction, "help_description"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
        when: safeAnswer(fieldValue(interaction, "help_when"), "—", DISCORD_SHORT_INPUT_MAX_LENGTH),
        evidence: safeAnswer(fieldValue(interaction, "help_evidence"), "—", DISCORD_PARAGRAPH_INPUT_MAX_LENGTH),
      };
      initialState.currentStep = TICKET_QUESTIONS.help_report.length;
      initialState.status = "completed";
      await persistTicketProgress(interaction.channelId, interaction.user.id, initialState);
      await lockTicketPanel(interaction, "help_report", "completed");
    }
  } catch (err) {
    logger.error(
      { err, guildId: interaction.guildId, channelId: interaction.channelId, ticketKind: kind },
      "Interactive ticket form could not be posted",
    );
    await interaction.editReply({
      content: "❌ Răspunsurile nu au putut fi adăugate în ticket. Încearcă din nou.",
    });
    return true;
  }

  await dismissTicketSuccess(interaction);
  return true;
}

async function getTicketProgress(
  channelId: string | null,
  applicantId: string,
  refresh = false,
): Promise<TicketProgressState | null> {
  if (!channelId) return null;
  const key = ticketProgressKey(channelId, applicantId);
  const cached = ticketProgress.get(key);
  if (cached && !refresh) return cached;
  const persisted = await loadTicketProgress(channelId, applicantId);
  if (persisted) ticketProgress.set(key, persisted);
  else if (refresh) ticketProgress.delete(key);
  return persisted;
}

async function persistTicketProgress(
  channelId: string | null,
  applicantId: string,
  state: TicketProgressState,
): Promise<void> {
  if (!channelId) throw new Error("Ticket progress cannot be persisted without a channel");
  ticketProgress.set(ticketProgressKey(channelId, applicantId), state);
  await saveTicketProgress(channelId, applicantId, state);
}
