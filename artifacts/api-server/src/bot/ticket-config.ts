import { loadTicketConfig } from "./db";

export type TicketCategoryKind = "staff" | "partnership" | "help_report";

export type TicketCompletionAction = "lock" | "notify_staff" | "keep_open";
export type AllianceAnnouncementMode = "text" | "embed";
export type AllianceAnnouncementImageMode = "none" | "large" | "thumbnail";

export interface TicketQuestionConfig {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  multiline: boolean;
  required: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface TicketFlowConfig {
  mode: "legacy" | "custom";
  title: string;
  startButtonLabel: string;
  panelDescription: string;
  requirementsText: string;
  completionMessage: string;
  staffNotificationMessage: string;
  panelImageUrl?: string;
  panelThumbnailUrl?: string;
  completionImageUrl?: string;
  completionThumbnailUrl?: string;
  staffNotificationImageUrl?: string;
  staffNotificationThumbnailUrl?: string;
  completionAction: TicketCompletionAction;
  questions: TicketQuestionConfig[];
  /** Question keys included in the final Discord summary; omitted means all. */
  postedQuestionKeys?: string[];
}

export interface TicketConfig {
  categories: Record<TicketCategoryKind, string>;
  staffReviewRoleId: string;
  alliancePublicChannelId: string;
  allianceOwnerGuildId: string;
  allianceAnnouncementTemplate: string;
  allianceAnnouncementMode: AllianceAnnouncementMode;
  allianceAnnouncementImageUrl?: string;
  allianceAnnouncementThumbnailUrl?: string;
  allianceAnnouncementImageMode: AllianceAnnouncementImageMode;
  incompleteTimeoutMinutes: number;
  firstWarningMinutes: number;
  secondWarningMinutes: number;
  flows: Record<TicketCategoryKind, TicketFlowConfig>;
}

function envString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

export const DEFAULT_TICKET_CONFIG: TicketConfig = {
  categories: {
    staff: envString("ORACLE_STAFF_TICKET_CATEGORY_ID", "1545688369332228167"),
    partnership: envString("ORACLE_PARTNERSHIP_TICKET_CATEGORY_ID", "1545688531144413194"),
    help_report: envString("ORACLE_HELP_REPORT_TICKET_CATEGORY_ID", "1545688638438772796"),
  },
  staffReviewRoleId: envString("ORACLE_STAFF_REVIEW_ROLE_ID", "1472526137308745909"),
  alliancePublicChannelId: envString("ORACLE_ALLIANCE_PUBLIC_CHANNEL_ID", "1472997077373157602"),
  allianceOwnerGuildId: envString("ORACLE_ALLIANCE_OWNER_GUILD_ID", "1382035307607883816"),
  allianceAnnouncementTemplate: [
    "🤝 PACTUL CELOR DOUĂ REGATE",
    "══════════════════════════",
    "",
    "🏰 Comunitatea parteneră: {server_name}",
    "",
    "📝 Descrierea serverului:",
    "{description}",
    "",
    "👥 Membri: {members_total} total · {members_online} online",
    "🔗 Link: {invite}",
    "",
    "👤 Contract completat de: {applicant_mention}",
    "",
    "Pact pecetluit · Regatul Cenușii",
  ].join("\n"),
  allianceAnnouncementMode: "text",
  allianceAnnouncementImageUrl: undefined,
  allianceAnnouncementImageMode: "none",
  incompleteTimeoutMinutes: 60,
  firstWarningMinutes: 20,
  secondWarningMinutes: 50,
  flows: {
    staff: {
      mode: "legacy",
      title: "🛡️ Contract de Staff · Deschide aplicația",
      startButtonLabel: "Deschide aplicația",
      panelDescription: "Un contract de candidatură pentru Regatul Cenușii. Răspunde sincer la fiecare întrebare.",
      requirementsText: "Tag-ul serverului este obligatoriu pentru validarea aplicației.",
      completionMessage: "✅ Aplicația este completă. Un membru al echipei te va prelua cât mai curând.",
      staffNotificationMessage: "📨 O nouă aplicație de staff a fost completată și așteaptă evaluarea.",
      completionAction: "notify_staff",
      questions: [
        { key: "name", label: "Nume", description: "Care este numele tău?", placeholder: "Ex.: Andrei", multiline: false, required: true },
        { key: "age", label: "Vârstă", description: "Ce vârstă ai?", placeholder: "Ex.: 21", multiline: false, required: true },
        { key: "moderation", label: "Experiență în moderare", description: "Ai experiență în moderare?", placeholder: "Unde ai mai moderat și ce ai învățat?", multiline: true, required: true },
        { key: "availability", label: "Timp disponibil", description: "Cât timp poți dedica serverului?", placeholder: "Ex.: 1–2 ore pe zi", multiline: false, required: true },
        { key: "motivation", label: "De ce dorești rolul?", description: "De ce dorești rolul de staff?", placeholder: "Ce te motivează să ajuți Regatul?", multiline: true, required: true },
        { key: "conflict", label: "Conflict între membri", description: "Cum ai rezolva un conflict între membri?", placeholder: "Descrie pașii pe care i-ai urma.", multiline: true, required: true },
        { key: "improvements", label: "Îmbunătățiri pentru server", description: "Ce ai îmbunătăți pe server?", placeholder: "Propune una sau mai multe îmbunătățiri.", multiline: true, required: true },
        { key: "server_tag", label: "Tag-ul serverului", description: "Accepți să porți tag-ul serverului?", placeholder: "Răspunde clar cu Da sau Nu.", multiline: false, required: true },
      ],
    },
    partnership: {
      mode: "legacy",
      title: "🤝 Contract de Parteneriat · Deschide propunerea",
      startButtonLabel: "Deschide propunerea",
      panelDescription: "Un contract de colaborare între două comunități. Completează informațiile despre server și colaborare.",
      requirementsText: "Pregătește informațiile serverului, invitația și condițiile propuse.",
      completionMessage: "✅ Propunerea este completă și a fost trimisă staffului pentru verificare.",
      staffNotificationMessage: "📨 O nouă cerere de alianță a fost completată și așteaptă confirmarea staffului.",
      completionAction: "notify_staff",
      questions: [
        { key: "server_name", label: "Numele serverului", description: "Cum se numește serverul vostru?", placeholder: "Ex.: Regatul Umbrelor", multiline: false, required: true },
        { key: "representative", label: "Reprezentantul serverului", description: "Cine reprezintă serverul în această alianță?", placeholder: "Numele și username-ul reprezentantului", multiline: false, required: true },
        { key: "invite", label: "Linkul serverului", description: "Care este invitația Discord a serverului?", placeholder: "https://discord.gg/...", multiline: false, required: true },
        { key: "members", label: "Membri și activitate", description: "Câți membri aveți și câți sunt activi aproximativ?", placeholder: "Ex.: 2.000 total · 300 activi", multiline: false, required: true },
        { key: "description", label: "Descrierea serverului", description: "Descrieți serverul, tematica și comunitatea.", placeholder: "Prezentați serverul și atmosfera comunității.", multiline: true, required: true },
        { key: "motivation", label: "Motivul alianței", description: "De ce doriți o alianță cu noi?", placeholder: "Ce vă face să căutați acest pact?", multiline: true, required: true },
        { key: "offer", label: "Ce oferă serverul vostru", description: "Ce puteți oferi în cadrul alianței?", placeholder: "Promovare, evenimente, comunitate sau alte beneficii.", multiline: true, required: true },
        { key: "terms", label: "Așteptări și reguli", description: "Ce așteptați și acceptați regulile pactului?", placeholder: "Scrieți condițiile și confirmați regulile.", multiline: true, required: true },
      ],
    },
    help_report: {
      mode: "legacy",
      title: "🕯️ Solicitare pentru Staff · Deschide sesizarea",
      startButtonLabel: "Deschide sesizarea",
      panelDescription: "O declarație pentru staff, cu detaliile necesare pentru ajutor sau raportare.",
      requirementsText: "Descrie cazul cât mai clar și atașează dovezi când este posibil.",
      completionMessage: "✅ Sesizarea a fost înregistrată. Stafful va reveni în acest ticket.",
      staffNotificationMessage: "📨 O nouă solicitare pentru staff a fost completată.",
      completionAction: "lock",
      questions: [
        { key: "type", label: "Tipul solicitării", description: "Este ajutor tehnic sau raportare?", placeholder: "Ex.: ajutor tehnic / raportare", multiline: false, required: true },
        { key: "target", label: "Membrul raportat", description: "Completează dacă este o raportare.", placeholder: "Numele sau mențiunea membrului", multiline: false, required: false },
        { key: "description", label: "Ce s-a întâmplat?", description: "Descrie cazul cât mai clar.", placeholder: "Povestește ce s-a întâmplat.", multiline: true, required: true },
        { key: "when", label: "Când s-a întâmplat?", description: "Data sau momentul aproximativ.", placeholder: "Ex.: astăzi, în jurul orei 18:00", multiline: false, required: true },
        { key: "evidence", label: "Dovezi", description: "Linkuri, capturi sau mesaje relevante.", placeholder: "Adaugă linkuri sau explică ce dovezi ai.", multiline: true, required: false },
      ],
    },
  },
};

function validSnowflake(value: unknown): value is string {
  return typeof value === "string" && /^\d{5,25}$/.test(value);
}

function textOrDefault(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function imageUrlOrEmpty(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const candidate = value.trim().slice(0, 2_000);
  return /^https:\/\/\S+$/i.test(candidate) || /^\/api\/storage\/objects\/[a-zA-Z0-9/_-]+$/.test(candidate)
    ? candidate
    : undefined;
}

function normalizeFlow(value: unknown, fallback: TicketFlowConfig): TicketFlowConfig {
  const raw = value && typeof value === "object" ? value as Partial<TicketFlowConfig> : {};
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions: TicketQuestionConfig[] = [];
  const keys = new Set<string>();
  for (const item of rawQuestions.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const question = item as Partial<TicketQuestionConfig>;
    const key = typeof question.key === "string"
      ? question.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32)
      : "";
    if (!key || keys.has(key)) continue;
    keys.add(key);
    questions.push({
      key,
      label: textOrDefault(question.label, `Întrebarea ${questions.length + 1}`, 45),
      description: textOrDefault(question.description, "Răspunde cât mai clar.", 900),
      placeholder: textOrDefault(question.placeholder, "Scrie răspunsul tău...", 100),
      multiline: question.multiline === true,
      required: question.required !== false,
      imageUrl: imageUrlOrEmpty(question.imageUrl),
      thumbnailUrl: imageUrlOrEmpty(question.thumbnailUrl),
    });
  }
  const normalizedQuestions = questions.length > 0 ? questions : fallback.questions;
  const postedQuestionKeys = Array.isArray(raw.postedQuestionKeys)
    ? normalizedQuestions
      .filter((question) => raw.postedQuestionKeys?.includes(question.key))
      .map((question) => question.key)
    : normalizedQuestions.map((question) => question.key);
  return {
    mode: raw.mode === "custom" ? "custom" : fallback.mode,
    title: textOrDefault(raw.title, fallback.title, 256),
    startButtonLabel: textOrDefault(raw.startButtonLabel, fallback.startButtonLabel, 80),
    panelDescription: textOrDefault(raw.panelDescription, fallback.panelDescription, 2_000),
    requirementsText: textOrDefault(raw.requirementsText, fallback.requirementsText, 2_000),
    completionMessage: textOrDefault(raw.completionMessage, fallback.completionMessage, 2_000),
    staffNotificationMessage: textOrDefault(raw.staffNotificationMessage, fallback.staffNotificationMessage, 2_000),
    panelImageUrl: imageUrlOrEmpty(raw.panelImageUrl),
    panelThumbnailUrl: imageUrlOrEmpty(raw.panelThumbnailUrl),
    completionImageUrl: imageUrlOrEmpty(raw.completionImageUrl),
    completionThumbnailUrl: imageUrlOrEmpty(raw.completionThumbnailUrl),
    staffNotificationImageUrl: imageUrlOrEmpty(raw.staffNotificationImageUrl),
    staffNotificationThumbnailUrl: imageUrlOrEmpty(raw.staffNotificationThumbnailUrl),
    completionAction:
      raw.completionAction === "lock" || raw.completionAction === "notify_staff" || raw.completionAction === "keep_open"
        ? raw.completionAction
        : fallback.completionAction,
    questions: normalizedQuestions,
    postedQuestionKeys,
  };
}

export function normalizeTicketConfig(value: unknown): TicketConfig {
  const raw = value && typeof value === "object" ? value as Partial<TicketConfig> : {};
  const categories = raw.categories && typeof raw.categories === "object"
    ? raw.categories as Partial<Record<TicketCategoryKind, unknown>>
    : {};
  const numberOrDefault = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate >= min && candidate <= max
      ? candidate
      : fallback;
  const rawFlows = raw.flows && typeof raw.flows === "object"
    ? raw.flows as Partial<Record<TicketCategoryKind, unknown>>
    : {};
  const hasExplicitAnnouncementThumbnail = Object.prototype.hasOwnProperty.call(
    raw,
    "allianceAnnouncementThumbnailUrl",
  );
  const legacyAnnouncementImage = imageUrlOrEmpty(raw.allianceAnnouncementImageUrl);

  return {
    categories: {
      staff: validSnowflake(categories.staff) ? categories.staff : DEFAULT_TICKET_CONFIG.categories.staff,
      partnership: validSnowflake(categories.partnership) ? categories.partnership : DEFAULT_TICKET_CONFIG.categories.partnership,
      help_report: validSnowflake(categories.help_report) ? categories.help_report : DEFAULT_TICKET_CONFIG.categories.help_report,
    },
    staffReviewRoleId: validSnowflake(raw.staffReviewRoleId) ? raw.staffReviewRoleId : DEFAULT_TICKET_CONFIG.staffReviewRoleId,
    alliancePublicChannelId: validSnowflake(raw.alliancePublicChannelId) ? raw.alliancePublicChannelId : DEFAULT_TICKET_CONFIG.alliancePublicChannelId,
    allianceOwnerGuildId: validSnowflake(raw.allianceOwnerGuildId) ? raw.allianceOwnerGuildId : DEFAULT_TICKET_CONFIG.allianceOwnerGuildId,
    allianceAnnouncementTemplate: textOrDefault(
      raw.allianceAnnouncementTemplate,
      DEFAULT_TICKET_CONFIG.allianceAnnouncementTemplate,
      2_000,
    ),
    allianceAnnouncementMode:
      raw.allianceAnnouncementMode === "embed" ? "embed" : DEFAULT_TICKET_CONFIG.allianceAnnouncementMode,
    allianceAnnouncementImageUrl:
      !hasExplicitAnnouncementThumbnail && raw.allianceAnnouncementImageMode === "thumbnail"
        ? undefined
        : legacyAnnouncementImage,
    allianceAnnouncementThumbnailUrl:
      imageUrlOrEmpty(raw.allianceAnnouncementThumbnailUrl) ??
      (!hasExplicitAnnouncementThumbnail && raw.allianceAnnouncementImageMode === "thumbnail"
        ? legacyAnnouncementImage
        : undefined),
    allianceAnnouncementImageMode:
      raw.allianceAnnouncementImageMode === "large" || raw.allianceAnnouncementImageMode === "thumbnail"
        ? raw.allianceAnnouncementImageMode
        : DEFAULT_TICKET_CONFIG.allianceAnnouncementImageMode,
    incompleteTimeoutMinutes: numberOrDefault(raw.incompleteTimeoutMinutes, DEFAULT_TICKET_CONFIG.incompleteTimeoutMinutes, 10, 240),
    firstWarningMinutes: numberOrDefault(raw.firstWarningMinutes, DEFAULT_TICKET_CONFIG.firstWarningMinutes, 1, 180),
    secondWarningMinutes: numberOrDefault(raw.secondWarningMinutes, DEFAULT_TICKET_CONFIG.secondWarningMinutes, 2, 239),
    flows: {
      staff: normalizeFlow(rawFlows.staff, DEFAULT_TICKET_CONFIG.flows.staff),
      partnership: normalizeFlow(rawFlows.partnership, DEFAULT_TICKET_CONFIG.flows.partnership),
      help_report: normalizeFlow(rawFlows.help_report, DEFAULT_TICKET_CONFIG.flows.help_report),
    },
  };
}

const cachedByGuild = new Map<string, TicketConfig>();

export async function initTicketConfig(guildId: string): Promise<void> {
  cachedByGuild.set(guildId, normalizeTicketConfig(await loadTicketConfig(guildId)));
}

export function getTicketConfig(guildId: string | null | undefined): TicketConfig {
  return guildId ? (cachedByGuild.get(guildId) ?? DEFAULT_TICKET_CONFIG) : DEFAULT_TICKET_CONFIG;
}

export function setTicketConfig(guildId: string, value: unknown): TicketConfig {
  const normalized = normalizeTicketConfig(value);
  cachedByGuild.set(guildId, normalized);
  return normalized;
}
