export interface ModerationAuditLog {
  id: string;
  guildId: string;
  actorId: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPresentation {
  title: string;
  details: string;
}

export const AUDIT_EVENT_CATEGORIES = [
  { value: "messages", label: "Mesaje" },
  { value: "members", label: "Membri" },
  { value: "channels", label: "Canale" },
  { value: "roles", label: "Roluri" },
  { value: "voice", label: "Activitate vocală" },
  { value: "moderation", label: "Moderare" },
  { value: "security", label: "Securitate" },
  { value: "other", label: "Altele" },
] as const;

export type AuditEventCategory = (typeof AUDIT_EVENT_CATEGORIES)[number]["value"];
export type AuditEventCategoryFilter = AuditEventCategory | "all";
export const AUDIT_PAGE_SIZE = 50;

export interface AuditLogQuery {
  search?: string;
  category?: AuditEventCategoryFilter;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

export interface AuditDateRange {
  start?: string;
  end?: string;
}

export function auditDateRangeError({ start, end }: AuditDateRange): string | null {
  if ((start && !Number.isFinite(Date.parse(start))) || (end && !Number.isFinite(Date.parse(end)))) {
    return "Introdu o dată și o oră valide.";
  }
  if (start && end && Date.parse(start) > Date.parse(end)) {
    return "Data de început trebuie să fie înaintea sau egală cu data de sfârșit.";
  }
  return null;
}

export function getAuditEventCategory(eventType: string): AuditEventCategory {
  const normalized = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();
  if (normalized.startsWith("discord.message_")) return "messages";
  if (normalized.startsWith("discord.member_")) return "members";
  if (normalized.startsWith("discord.channel_")) return "channels";
  if (normalized.startsWith("discord.guild_role_")) return "roles";
  if (normalized.startsWith("discord.voice_")) return "voice";
  if (/^(config\.|case\.|cases\.|action\.)/.test(normalized)) return "moderation";
  if (/^(raid\.|suspicious\.|spam\.|automod\.|ai\.|event\.)/.test(normalized)) return "security";
  return "other";
}

export function filterAuditEvents(
  events: ModerationAuditLog[],
  search: string,
  category: AuditEventCategoryFilter,
  range: AuditDateRange = {},
): ModerationAuditLog[] {
  if (auditDateRangeError(range)) return [];
  const start = range.start ? Date.parse(range.start) : -Infinity;
  const end = range.end ? Date.parse(range.end) : Infinity;
  const query = search.toLocaleLowerCase();
  return events.filter((event) => {
    if (range.start || range.end) {
      const timestamp = Date.parse(event.createdAt);
      if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) return false;
    }
    if (category !== "all" && getAuditEventCategory(event.eventType || "unknown") !== category) {
      return false;
    }
    if (!query) return true;

    const presentation = presentAuditLog(event);
    return [
      presentation.title,
      presentation.details,
      presentAuditActor(event),
      event.actorId,
      event.targetId,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

const eventTitles: Record<string, string> = {
  "config.updated": "Configurație actualizată",
  "case.created": "Caz de moderare creat",
  "case.updated": "Caz de moderare actualizat",
  "case.note_added": "Notă adăugată la caz",
  "cases.pruned": "Cazuri vechi eliminate",
  "action.applied": "Acțiune aplicată",
  "action.failed": "Acțiune eșuată",
  "action.reconciled": "Acțiune verificată",
  "action.finalized": "Rezultat confirmat",
  "automod.message_delete_failed": "Ștergere AutoMod eșuată",
  "ai.flagged": "Mesaj semnalat de moderarea AI",
  "raid.detected": "Alertă Anti-Raid",
  "raid.lockdown_failed": "Blocare Anti-Raid eșuată",
  "discord.message_update": "Mesaj editat",
  "discord.message_delete": "Mesaj șters",
  "discord.message_bulk_delete": "Mesaje șterse în masă",
  "discord.member_join": "Membru a intrat pe server",
  "discord.member_leave": "Membru a părăsit serverul",
  "discord.member_update": "Membru sau roluri actualizate",
  "discord.voice_state_update": "Stare vocală schimbată",
  "discord.channelCreate": "Canal creat",
  "discord.channelUpdate": "Canal actualizat",
  "discord.channelDelete": "Canal șters",
  "discord.guildRoleCreate": "Rol creat",
  "discord.guildRoleUpdate": "Rol actualizat",
  "discord.guildRoleDelete": "Rol șters",
};

const actionLabels: Record<string, string> = {
  warn: "avertisment",
  mute: "timeout",
  unmute: "ridicare timeout",
  kick: "eliminare",
  ban: "interdicție",
  purge: "ștergere mesaje",
  slowmode: "slowmode",
  lock: "blocare canal",
  unlock: "deblocare canal",
  nick: "schimbare poreclă",
  role: "modificare rol",
  delete: "ștergere mesaj",
};

const settingTitles: Record<string, { on: string; off: string }> = {
  protection: { on: "Protecția generală a fost activată.", off: "Protecția generală a fost dezactivată." },
  autoMod: { on: "AutoMod a fost activat.", off: "AutoMod a fost dezactivat." },
  wordFilter: { on: "Filtrul de cuvinte a fost activat.", off: "Filtrul de cuvinte a fost dezactivat." },
  linkBlock: { on: "Blocarea linkurilor a fost activată.", off: "Blocarea linkurilor a fost dezactivată." },
  antiRaid: { on: "Anti-Raid a fost activat.", off: "Anti-Raid a fost dezactivat." },
  antiSpam: { on: "Anti-Spam a fost activat.", off: "Anti-Spam a fost dezactivat." },
  antiFlood: { on: "Anti-Flood a fost activat.", off: "Anti-Flood a fost dezactivat." },
  suspiciousBehavior: { on: "Detectarea comportamentului suspect a fost activată.", off: "Detectarea comportamentului suspect a fost dezactivată." },
  ai: { on: "Moderarea AI a fost activată.", off: "Moderarea AI a fost dezactivată." },
};

const categoryLabels: Record<string, string> = {
  toxicity: "toxicitate",
  profanity: "limbaj vulgar",
  attacks: "atacuri",
  bullying: "hărțuire",
  intelligentSpam: "spam inteligent",
  trolling: "trolling",
};

function getText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanize(value: string): string {
  const words = value.replace(/[._-]+/g, " ").trim();
  return words ? words.charAt(0).toLocaleUpperCase() + words.slice(1) : "Eveniment de moderare";
}

function actionLabel(value: unknown): string | null {
  const action = getText(value);
  return action ? actionLabels[action] ?? humanize(action).toLocaleLowerCase() : null;
}

function readableDiscordText(value: string): string {
  return value
    .replace(/<@!?(\d+)>/g, "membru $1")
    .replace(/<@&(\d+)>/g, "rol $1")
    .replace(/<#(\d+)>/g, "canal $1")
    .replace(/\*\*(.*?)\*\*/g, "$1");
}

function targetDescription(log: ModerationAuditLog): string | null {
  if (!log.targetId) return null;
  const targetType = log.targetType
    ? `${humanize(log.targetType).toLocaleLowerCase()} `
    : "";
  return `Țintă: ${targetType}${log.targetId}`;
}

export function presentAuditActor(log: ModerationAuditLog): string {
  if (log.detail?.actorVerified === false) return "Actor neverificat";
  return log.actorId || "Sistem";
}

function eventMetadataDetails(log: ModerationAuditLog, normalizedType: string): string | null {
  const detail = log.detail ?? {};
  const channelId = getText(detail.channelId);
  const channel = channelId ? `Canal: ${channelId}.` : "";
  const entityName = getText(detail.entityName) ?? getText(detail.name);

  if (normalizedType === "discord.message_update") {
    return `Mesajul a fost editat în ${channelId ? `canalul ${channelId}` : "un canal"}. Conținutul nu este salvat.`;
  }
  if (normalizedType === "discord.message_delete" || normalizedType === "discord.message_bulk_delete") {
    const count = typeof detail.messageCount === "number" ? detail.messageCount : 1;
    return `${count} ${count === 1 ? "mesaj a fost șters" : "mesaje au fost șterse"}${channelId ? ` din canalul ${channelId}` : ""}. Conținutul nu este salvat.`;
  }
  if (normalizedType === "discord.member_join") {
    const age = typeof detail.accountAgeDays === "number" ? ` Contul are ${detail.accountAgeDays} zile.` : "";
    return `Membrul a intrat pe server.${age}`;
  }
  if (normalizedType === "discord.member_leave") return "Membrul a părăsit serverul.";
  if (normalizedType === "discord.member_update") {
    const changes: string[] = [];
    if (detail.nicknameChanged === true) {
      changes.push(`Poreclă: „${getText(detail.oldNickname) ?? "fără poreclă"}” → „${getText(detail.newNickname) ?? "fără poreclă"}”.`);
    }
    if (Array.isArray(detail.addedRoles) && detail.addedRoles.length) changes.push(`Roluri adăugate: ${detail.addedRoles.map(String).join(", ")}.`);
    if (Array.isArray(detail.removedRoles) && detail.removedRoles.length) changes.push(`Roluri eliminate: ${detail.removedRoles.map(String).join(", ")}.`);
    return changes.join(" ") || "Detaliile schimbării membrului nu sunt disponibile.";
  }
  if (normalizedType === "discord.voice_state_update") {
    const changes: string[] = [];
    if (detail.channelChanged === true) changes.push(`Canal vocal: ${getText(detail.oldChannelId) ?? "în afara canalului"} → ${getText(detail.newChannelId) ?? "în afara canalului"}.`);
    for (const [key, label] of [["selfMute", "Microfon propriu"], ["serverMute", "Microfon server"], ["selfDeaf", "Sunet propriu"], ["serverDeaf", "Sunet server"], ["streaming", "Transmisie"], ["video", "Video"]] as const) {
      if (typeof detail[key] === "boolean") changes.push(`${label}: ${detail[key] ? "activ" : "inactiv"}.`);
    }
    return changes.join(" ") || "Starea vocală a fost actualizată.";
  }
  if (/^discord\.(channel|guild_role)_(create|update|delete)$/.test(normalizedType)) {
    const operation = normalizedType.endsWith("_create") ? "a fost creat" : normalizedType.endsWith("_delete") ? "a fost șters" : "a fost actualizat";
    const changes = detail.changes && typeof detail.changes === "object"
      ? Object.entries(detail.changes as Record<string, unknown>)
        .map(([key, value]) => `${humanize(key).toLocaleLowerCase()}: ${JSON.stringify(value)}`)
        .join("; ")
      : "";
    return `${entityName ? `„${entityName}” ` : ""}${operation}.${channel ? ` ${channel}` : ""}${changes ? ` Modificări: ${changes}` : ""}`;
  }
  return null;
}

export function presentAuditLog(log: ModerationAuditLog): AuditLogPresentation {
  const detail = log.detail ?? {};
  const eventType = log.eventType || "unknown";
  const title = eventTitles[eventType] ?? humanize(eventType);
  let details: string | null = null;
  const normalizedType = eventType.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLocaleLowerCase();

  const metadataDetails = eventMetadataDetails(log, normalizedType);
  if (metadataDetails) {
    return { title, details: metadataDetails };
  }

  switch (eventType) {
    case "config.updated": {
      const toggle = getText(detail.protectionToggle);
      if (toggle && typeof detail.enabled === "boolean") {
        details = settingTitles[toggle]?.[detail.enabled ? "on" : "off"]
          ?? `${humanize(toggle)} ${detail.enabled ? "a fost activat." : "a fost dezactivat."}`;
      } else {
        const version = typeof detail.version === "number" ? ` Versiunea ${detail.version}.` : "";
        details = `Setările de moderare au fost actualizate.${version}`;
      }
      break;
    }
    case "case.created": {
      const action = actionLabel(detail.actionType);
      details = action ? `Acțiune în caz: ${action}.` : "A fost deschis un caz de moderare.";
      break;
    }
    case "case.updated": {
      const changes = [
        detail.status === "closed" ? "Cazul a fost închis." : null,
        detail.status === "open" ? "Cazul a fost redeschis." : null,
        detail.reasonChanged === true ? "Motivul a fost actualizat." : null,
        detail.evidenceChanged === true ? "Dovezile au fost actualizate." : null,
      ].filter(Boolean);
      details = changes.join(" ") || "Detaliile cazului au fost actualizate.";
      break;
    }
    case "case.note_added":
      details = "A fost adăugată o notă la caz.";
      break;
    case "cases.pruned": {
      const count = typeof detail.count === "number" ? detail.count : null;
      const retention = typeof detail.retentionDays === "number" ? ` după ${detail.retentionDays} zile de păstrare` : "";
      details = count === null
        ? "Cazurile expirate au fost eliminate."
        : `${count} ${count === 1 ? "caz expirat a fost eliminat" : "cazuri expirate au fost eliminate"}${retention}.`;
      break;
    }
    case "action.applied": {
      const summary = getText(detail.summary);
      const action = actionLabel(detail.type);
      details = summary
        ? readableDiscordText(summary)
        : action ? `Acțiunea de tip ${action} a fost aplicată.` : "Acțiunea de moderare a fost aplicată.";
      break;
    }
    case "action.failed": {
      const error = getText(detail.error);
      const action = actionLabel(detail.type);
      details = error
        ? `Nu s-a putut aplica${action ? ` acțiunea de tip ${action}` : " acțiunea"}: ${readableDiscordText(error)}`
        : "Acțiunea de moderare nu a putut fi aplicată.";
      break;
    }
    case "action.reconciled": {
      const status = detail.status === "applied" ? "aplicată" : detail.status === "failed" ? "eșuată" : null;
      const note = getText(detail.note);
      details = `${status ? `Acțiunea a fost marcată ca ${status}.` : "Acțiunea a fost verificată."}${note ? ` Notă: ${readableDiscordText(note)}` : ""}`;
      break;
    }
    case "action.finalized": {
      const status = detail.status === "applied" ? "aplicată" : detail.status === "failed" ? "eșuată" : detail.status === "uncertain" ? "neconfirmată" : null;
      details = status ? `Acțiunea a fost înregistrată ca ${status}.` : "Rezultatul acțiunii a fost înregistrat.";
      break;
    }
    case "automod.message_delete_failed": {
      const kind = getText(detail.kind);
      const error = getText(detail.error);
      details = `AutoMod nu a putut șterge mesajul${kind ? ` (${humanize(kind).toLocaleLowerCase()})` : ""}.${error ? ` ${readableDiscordText(error)}` : ""}`;
      break;
    }
    case "ai.flagged": {
      const category = getText(detail.category);
      details = category ? `Categorie detectată: ${categoryLabels[category] ?? humanize(category).toLocaleLowerCase()}.` : "Mesajul a fost semnalat pentru verificare.";
      break;
    }
    case "raid.detected": {
      if (detail.youngAccount === true) {
        details = "A fost detectat un cont nou care a intrat pe server.";
      } else if (typeof detail.joins === "number") {
        details = `${detail.joins} ${detail.joins === 1 ? "intrare suspectă detectată" : "intrări suspecte detectate"} într-un interval scurt.`;
      } else {
        details = "A fost detectat un val suspect de intrări.";
      }
      break;
    }
    case "raid.lockdown_failed": {
      const error = getText(detail.error);
      details = error ? readableDiscordText(error) : "Nu s-a putut aplica blocarea anti-raid.";
      break;
    }
    default:
      details = getText(detail.summary) ?? getText(detail.reason) ?? targetDescription(log);
  }

  return {
    title,
    details: details || targetDescription(log) || "Detaliile evenimentului nu sunt disponibile.",
  };
}