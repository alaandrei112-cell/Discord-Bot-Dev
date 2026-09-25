import { ChannelType, PermissionFlagsBits, type Guild, type NonThreadGuildBasedChannel } from "discord.js";
import type { ChannelConfig, VerificationConfig } from "./db";
import type { ActivityLogCategory, ModerationConfig } from "../moderation/config";
import type { TicketConfig, TicketCategoryKind } from "./ticket-config";

export type ProvisionedChannel = {
  key: string;
  id: string;
  name: string;
  type: "text" | "category";
};

export type ChannelProvisionResult = {
  channelConfig: ChannelConfig;
  ticketConfig: TicketConfig;
  moderationConfig: ModerationConfig;
  verification: VerificationConfig;
  created: ProvisionedChannel[];
  reused: ProvisionedChannel[];
};

export type ChannelPermissionConfig = {
  roleIds: string[];
  readMessageHistory: boolean;
  sendMessages: boolean;
  rolePermissions?: Record<string, {
    viewChannel: boolean;
    readMessageHistory: boolean;
    sendMessages: boolean;
  }>;
};

type ChannelTypeName = "text" | "category";

type ChannelTarget = {
  key: string;
  currentId?: string | null;
  names: string[];
  type: ChannelTypeName;
  category: ProvisioningCategoryKey;
};

export type ProvisioningCategoryKey = "gameplay" | "admin" | "filtered" | "links" | "security" | "verification";
export type ActivityLogProvisionResult = {
  activityLog: ModerationConfig["activityLog"];
  created: ProvisionedChannel[];
  reused: ProvisionedChannel[];
};

type ProvisioningCategoryTarget = {
  key: ProvisioningCategoryKey;
  names: string[];
};

const CATEGORY_TARGETS: ProvisioningCategoryTarget[] = [
  { key: "gameplay", names: ["🎮・JOC ȘI EVENIMENTE", "joc si evenimente", "gameplay", "joc"] },
  { key: "admin", names: ["🛠️・ADMINISTRAȚIE", "administratie", "admin", "operatiuni"] },
  { key: "filtered", names: ["🧹・MESAJE FILTRATE", "mesaje filtrate", "moderare", "anti-spam"] },
  { key: "links", names: ["🔗・LINKURI", "linkuri", "filtrare linkuri", "anti-link"] },
  { key: "security", names: ["🚨・SECURITATE", "securitate", "anti-raid", "alerte securitate"] },
  { key: "verification", names: ["✅・VERIFICARE", "verificare", "verification"] },
];

export const PROVISIONING_CATEGORY_KEYS: ProvisioningCategoryKey[] = [
  "gameplay",
  "admin",
  "filtered",
  "links",
  "security",
  "verification",
];

const GAMEPLAY_TARGETS: Array<Omit<ChannelTarget, "currentId"> & { key: keyof ChannelConfig }> = [
  { key: "main", type: "text", category: "gameplay", names: ["cufere-si-oracol", "cufere", "oracol"] },
  { key: "event", type: "text", category: "gameplay", names: ["ora-umbrelor"] },
  { key: "boss", type: "text", category: "gameplay", names: ["dragonul-stins"] },
  { key: "trader", type: "text", category: "gameplay", names: ["negustorul"] },
  { key: "eventTop", type: "text", category: "gameplay", names: ["top-ora-umbrelor"] },
  { key: "bossTop", type: "text", category: "gameplay", names: ["top-dragonul-stins"] },
  { key: "council", type: "text", category: "admin", names: ["consiliul-umbrelor"] },
  { key: "fratia", type: "text", category: "admin", names: ["chivotul-fratiei", "fratia"] },
];

const TICKET_TARGETS: Array<{ key: TicketCategoryKind; names: string[] }> = [
  { key: "staff", names: ["🎫・TICHETE • STAFF", "tichete-staff", "aplicare-staff", "staff"] },
  { key: "partnership", names: ["🎫・TICHETE • PARTENERIATE", "tichete-parteneriate", "parteneriate", "partnership"] },
  { key: "help_report", names: ["🎫・TICHETE • AJUTOR", "tichete-ajutor-raportare", "ajutor-raportare", "help-report"] },
];

const MODERATION_TARGETS = [
  { key: "antiRaid.alertChannelId", category: "security", names: ["mod-anti-raid", "alerte-raid"] },
  { key: "antiSpam.logChannelId", category: "filtered", names: ["mod-anti-spam", "jurnal-anti-spam"] },
  { key: "suspiciousBehavior.alertChannelId", category: "security", names: ["mod-comportament-suspect", "alerte-comportament"] },
  { key: "ai.logChannelId", category: "filtered", names: ["mod-ai", "jurnal-ai"] },
  { key: "audit.channelId", category: "admin", names: ["mod-audit", "audit"] },
] as const;

const provisionLocks = new Map<string, Promise<ChannelProvisionResult>>();
const activityProvisionLocks = new Map<string, Promise<ActivityLogProvisionResult>>();

const ACTIVITY_LOG_CATEGORIES: Array<{ key: ActivityLogCategory; name: string }> = [
  { key: "messages", name: "jurnal-mesaje" },
  { key: "members", name: "jurnal-membri" },
  { key: "channels", name: "jurnal-canale" },
  { key: "roles", name: "jurnal-roluri" },
  { key: "voice", name: "jurnal-vocal" },
  { key: "moderation", name: "jurnal-moderare" },
  { key: "security", name: "jurnal-securitate" },
];

function activityLogPermissionOverwrites(guild: Guild, roleIds: string[]) {
  const access = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
  const botAccess = [...access, PermissionFlagsBits.SendMessages];
  const botRoleId = guild.members.me?.roles.highest?.id;
  return [
    {
      id: guild.roles.everyone.id,
      deny: [...access, PermissionFlagsBits.SendMessages],
    },
    ...roleIds
      .filter((id) => id !== guild.roles.everyone.id && id !== botRoleId)
      .map((id) => ({ id, allow: access, deny: [PermissionFlagsBits.SendMessages] })),
    ...(botRoleId ? [{ id: botRoleId, allow: botAccess }] : []),
  ];
}

async function applyPermissions(
  guild: Guild,
  channel: NonThreadGuildBasedChannel,
  permission: ChannelPermissionConfig | undefined,
  previousRoleIds: string[] = [],
): Promise<void> {
  if (!permission || !channel.permissionOverwrites) return;
  const reason = "Permisiuni configurate din panoul de control";
  const everyoneId = guild.roles.everyone.id;
  const managedRoleIds = [...new Set([
    ...permission.roleIds,
    ...Object.keys(permission.rolePermissions ?? {}),
  ])];
  const missingRole = managedRoleIds.find((roleId) => !guild.roles.cache.has(roleId));
  if (missingRole) throw new Error(`Rolul ${missingRole} nu a fost găsit pe server.`);
  for (const roleId of new Set(previousRoleIds.filter((id) => id !== everyoneId && !managedRoleIds.includes(id)))) {
    if (guild.roles.cache.has(roleId)) {
      await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: null,
        ReadMessageHistory: null,
        SendMessages: null,
      }, { reason });
    }
  }
  await channel.permissionOverwrites.edit(everyoneId, {
    ViewChannel: false,
    ReadMessageHistory: false,
    SendMessages: false,
  }, { reason });
  for (const roleId of managedRoleIds) {
    const access = permission.rolePermissions?.[roleId];
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: access?.viewChannel ?? true,
      ReadMessageHistory: access?.readMessageHistory ?? permission.readMessageHistory,
      SendMessages: access?.sendMessages ?? permission.sendMessages,
    }, { reason });
  }
  const botRoleId = guild.members.me?.roles.highest?.id;
  if (botRoleId) {
    await channel.permissionOverwrites.edit(botRoleId, {
      ViewChannel: true,
      ReadMessageHistory: true,
      SendMessages: true,
    }, { reason });
  }
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ro")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^[^\p{Letter}\p{Number}]+/u, "")
    .replace(/[・|•]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isExpectedType(channel: { type: ChannelType }, type: ChannelTypeName): boolean {
  return type === "category"
    ? channel.type === ChannelType.GuildCategory
    : channel.type === ChannelType.GuildText;
}

function setNestedChannelId(config: ModerationConfig, path: string, id: string): void {
  const [section, field] = path.split(".");
  if (section === "antiRaid" && field === "alertChannelId") config.antiRaid.alertChannelId = id;
  if (section === "antiSpam" && field === "logChannelId") config.antiSpam.logChannelId = id;
  if (section === "suspiciousBehavior" && field === "alertChannelId") config.suspiciousBehavior.alertChannelId = id;
  if (section === "ai" && field === "logChannelId") config.ai.logChannelId = id;
  if (section === "audit" && field === "channelId") config.audit.channelId = id;
}

async function moveToCategory(
  channel: { parentId?: string | null; setParent?: (categoryId: string) => Promise<unknown> },
  categoryId: string,
): Promise<void> {
  if (channel.parentId === categoryId) return;
  if (typeof channel.setParent !== "function") {
    throw new Error(`Canalul ${categoryId} nu suportă mutarea într-o categorie.`);
  }
  await channel.setParent(categoryId);
}

/**
 * Resolve all channel destinations from the live guild. A configured valid
 * channel always wins, then a matching existing name is reused, and only
 * after both checks does Discord receive a create request.
 */
async function provisionGuildChannelsUnlocked(
  guild: Guild,
  input: {
    channelConfig: ChannelConfig;
    ticketConfig: TicketConfig;
    moderationConfig: ModerationConfig;
    verification: VerificationConfig;
    categories?: ProvisioningCategoryKey[];
    permissions?: Partial<Record<ProvisioningCategoryKey, ChannelPermissionConfig>>;
    previousPermissions?: Partial<Record<ProvisioningCategoryKey, ChannelPermissionConfig>>;
  },
): Promise<ChannelProvisionResult> {
  const channels = await guild.channels.fetch();
  const created: ProvisionedChannel[] = [];
  const reused: ProvisionedChannel[] = [];
  const categoryIds = new Map<ProvisioningCategoryKey, string>();
  const selectedCategories = new Set(input.categories ?? PROVISIONING_CATEGORY_KEYS);

  for (const target of CATEGORY_TARGETS.filter((target) => selectedCategories.has(target.key))) {
    const existing = [...channels.values()].find((channel) =>
      channel !== null &&
      isExpectedType(channel, "category") &&
      target.names.some((name) => normalizeName(channel.name) === normalizeName(name)),
    );
    if (existing) {
      reused.push({ key: `category.${target.key}`, id: existing.id, name: existing.name, type: "category" });
      categoryIds.set(target.key, existing.id);
      await applyPermissions(guild, existing, input.permissions?.[target.key], input.previousPermissions?.[target.key]?.roleIds);
      continue;
    }

    const createdCategory = await guild.channels.create({
      name: target.names[0],
      type: ChannelType.GuildCategory,
    });
    await applyPermissions(guild, createdCategory, input.permissions?.[target.key], input.previousPermissions?.[target.key]?.roleIds);
    created.push({ key: `category.${target.key}`, id: createdCategory.id, name: createdCategory.name, type: "category" });
    categoryIds.set(target.key, createdCategory.id);
  }

  const resolve = async (target: ChannelTarget): Promise<string> => {
    const categoryId = categoryIds.get(target.category);
    if (!categoryId) throw new Error(`Categoria ${target.category} nu a putut fi pregătită.`);
    const configured = target.currentId ? channels.get(target.currentId) : null;
    const existing = configured && isExpectedType(configured, target.type)
      ? configured
      : [...channels.values()].find((channel) =>
        channel !== null &&
        isExpectedType(channel, target.type) &&
        target.names.some((name) => normalizeName(channel.name) === normalizeName(name)),
      );

    if (existing) {
      if (target.type === "text") {
        await moveToCategory(existing, categoryId);
      }
      await applyPermissions(guild, existing, input.permissions?.[target.category], input.previousPermissions?.[target.category]?.roleIds);
      const result = { key: target.key, id: existing.id, name: existing.name, type: target.type };
      reused.push(result);
      return existing.id;
    }

    const createdChannel = await guild.channels.create({
      name: target.names[0],
      type: target.type === "category" ? ChannelType.GuildCategory : ChannelType.GuildText,
      ...(target.type === "text" ? { parent: categoryId } : {}),
    });
    await applyPermissions(guild, createdChannel, input.permissions?.[target.category], input.previousPermissions?.[target.category]?.roleIds);
    const result = { key: target.key, id: createdChannel.id, name: createdChannel.name, type: target.type };
    created.push(result);
    return createdChannel.id;
  };

  const channelConfig: ChannelConfig = { ...input.channelConfig };
  for (const target of GAMEPLAY_TARGETS.filter((target) => selectedCategories.has(target.category))) {
    channelConfig[target.key] = await resolve({
      ...target,
      currentId: input.channelConfig[target.key],
    });
  }

  const ticketConfig: TicketConfig = {
    ...input.ticketConfig,
    categories: { ...input.ticketConfig.categories },
  };
  if (selectedCategories.has("admin")) {
    for (const target of TICKET_TARGETS) {
    ticketConfig.categories[target.key] = await resolve({
      key: `tickets.categories.${target.key}`,
      currentId: input.ticketConfig.categories[target.key],
      names: target.names,
      type: "category",
      category: "admin",
    });
    }
  }

  const moderationConfig: ModerationConfig = structuredClone(input.moderationConfig);
  for (const target of MODERATION_TARGETS.filter((target) => selectedCategories.has(target.category))) {
    const [section, field] = target.key.split(".");
    const currentId = (moderationConfig[section as keyof ModerationConfig] as Record<string, unknown>)[field];
    const id = await resolve({
      key: `moderation.${target.key}`,
      currentId: typeof currentId === "string" ? currentId : null,
      names: [...target.names],
      type: "text",
      category: target.category,
    });
    setNestedChannelId(moderationConfig, target.key, id);
  }

  const verification = { ...input.verification };
  if (selectedCategories.has("verification")) {
    verification.channelId = await resolve({
      key: "verification.channelId",
      currentId: verification.channelId,
      names: ["verificare", "verificare-discord"],
      type: "text",
      category: "verification",
    });
  }

  return { channelConfig, ticketConfig, moderationConfig, verification, created, reused };
}

export function provisionGuildChannels(
  guild: Guild,
  input: {
    channelConfig: ChannelConfig;
    ticketConfig: TicketConfig;
    moderationConfig: ModerationConfig;
    verification: VerificationConfig;
    categories?: ProvisioningCategoryKey[];
    permissions?: Partial<Record<ProvisioningCategoryKey, ChannelPermissionConfig>>;
    previousPermissions?: Partial<Record<ProvisioningCategoryKey, ChannelPermissionConfig>>;
  },
): Promise<ChannelProvisionResult> {
  // A double-click or two owner tabs must not both fetch the same snapshot and
  // then create duplicate channels before either request persists its result.
  const previous = provisionLocks.get(guild.id);
  const next = (previous ?? Promise.resolve()).then(() => provisionGuildChannelsUnlocked(guild, input));
  provisionLocks.set(guild.id, next);
  const cleanup = () => {
    if (provisionLocks.get(guild.id) === next) provisionLocks.delete(guild.id);
  };
  void next.then(cleanup, cleanup);
  return next;
}

async function provisionActivityLogChannelsUnlocked(
  guild: Guild,
  input: {
    activityLog: ModerationConfig["activityLog"];
    previousRoleIds?: string[];
  },
): Promise<ActivityLogProvisionResult> {
  const channels = await guild.channels.fetch();
  const created: ProvisionedChannel[] = [];
  const reused: ProvisionedChannel[] = [];
  if (input.activityLog.roleIds.includes(guild.roles.everyone.id)) {
    throw new Error("@everyone nu poate fi selectat pentru canalele private de jurnal.");
  }
  const missingRole = input.activityLog.roleIds.find((roleId) => !guild.roles.cache.has(roleId));
  if (missingRole) throw new Error(`Rolul ${missingRole} nu a fost găsit pe server.`);
  const permission: ChannelPermissionConfig = {
    roleIds: input.activityLog.roleIds,
    readMessageHistory: true,
    sendMessages: false,
  };
  const previousRoleIds = input.previousRoleIds ?? [];
  const categoryNames = ["📋・JURNAL SERVER", "jurnal server", "server logs"];
  const configuredCategory = input.activityLog.categoryId
    ? channels.get(input.activityLog.categoryId)
    : null;
  const existingCategory = configuredCategory && isExpectedType(configuredCategory, "category")
    ? configuredCategory
    : [...channels.values()].find((channel) =>
      channel !== null &&
      isExpectedType(channel, "category") &&
      categoryNames.some((name) => normalizeName(channel.name) === normalizeName(name)),
    );

  let category: NonThreadGuildBasedChannel;
  if (existingCategory) {
    category = existingCategory;
    reused.push({ key: "activityLog.category", id: category.id, name: category.name, type: "category" });
  } else {
    category = await guild.channels.create({
      name: categoryNames[0],
      type: ChannelType.GuildCategory,
      permissionOverwrites: activityLogPermissionOverwrites(guild, input.activityLog.roleIds),
    });
    created.push({ key: "activityLog.category", id: category.id, name: category.name, type: "category" });
  }
  await applyPermissions(guild, category, permission, previousRoleIds);

  const channelIds = { ...input.activityLog.channelIds };
  for (const target of ACTIVITY_LOG_CATEGORIES) {
    if (!input.activityLog.categories[target.key]) {
      const existingLogChannel = channelIds[target.key] ? channels.get(channelIds[target.key]!) : null;
      if (existingLogChannel && isExpectedType(existingLogChannel, "text")) {
        // Keep inactive destinations and their history, but still remove access
        // from roles that were just de-selected for the private log system.
        await applyPermissions(guild, existingLogChannel, permission, previousRoleIds);
        reused.push({
          key: `activityLog.${target.key}`,
          id: existingLogChannel.id,
          name: existingLogChannel.name,
          type: "text",
        });
      }
      continue;
    }
    const configured = channelIds[target.key] ? channels.get(channelIds[target.key]!) : null;
    const existing = configured && isExpectedType(configured, "text")
      ? configured
      : [...channels.values()].find((channel) =>
        channel !== null &&
        isExpectedType(channel, "text") &&
        normalizeName(channel.name) === normalizeName(target.name),
      );

    let logChannel: NonThreadGuildBasedChannel;
    if (existing) {
      logChannel = existing;
      await moveToCategory(logChannel, category.id);
      reused.push({ key: `activityLog.${target.key}`, id: logChannel.id, name: logChannel.name, type: "text" });
    } else {
      logChannel = await guild.channels.create({
        name: target.name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: activityLogPermissionOverwrites(guild, input.activityLog.roleIds),
      });
      created.push({ key: `activityLog.${target.key}`, id: logChannel.id, name: logChannel.name, type: "text" });
    }
    await applyPermissions(guild, logChannel, permission, previousRoleIds);
    channelIds[target.key] = logChannel.id;
  }

  // Preserve destinations for categories that were switched off. Disabling
  // never deletes their channels or historical messages.
  return {
    activityLog: { ...input.activityLog, categoryId: category.id, channelIds },
    created,
    reused,
  };
}

export function provisionActivityLogChannels(
  guild: Guild,
  input: {
    activityLog: ModerationConfig["activityLog"];
    previousRoleIds?: string[];
  },
): Promise<ActivityLogProvisionResult> {
  const previous = activityProvisionLocks.get(guild.id);
  const next = (previous ?? Promise.resolve()).then(() => provisionActivityLogChannelsUnlocked(guild, input));
  activityProvisionLocks.set(guild.id, next);
  const cleanup = () => {
    if (activityProvisionLocks.get(guild.id) === next) activityProvisionLocks.delete(guild.id);
  };
  void next.then(cleanup, cleanup);
  return next;
}