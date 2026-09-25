import { z } from "zod";

const snowflake = z.string().regex(/^\d{5,25}$/, "Expected a Discord snowflake");
const idList = z.array(snowflake).max(100);
const textList = z.array(z.string().trim().min(1).max(200)).max(500);
const action = z.enum(["none", "warn", "mute", "kick", "ban", "delete"]);
const severity = z.enum(["soft", "normal", "hard"]);
const safeHttpsUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  return url.protocol === "https:" && host !== "localhost" && host !== "::1" && !privateIpv4;
}, "URL must use public HTTPS");
const safeGifUrl = safeHttpsUrl.refine((value) => new URL(value).pathname.toLowerCase().endsWith(".gif"), "Animation URL must point to a GIF");

export const EvidenceItemSchema = z.object({
  messageId: snowflake.optional(),
  channelId: snowflake.optional(),
  kind: z.string().trim().min(1).max(64).optional(),
  url: safeHttpsUrl.optional(),
  description: z.string().trim().min(1).max(1_000).optional(),
}).strict().refine((value) => value.messageId || value.channelId || value.url || value.description, {
  message: "Evidence must contain a message, channel, URL, or description",
});
export const EvidenceSchema = z.array(EvidenceItemSchema).max(25);

export const RuleSchema = z.object({
  enabled: z.boolean().default(false),
  action: action.default("none"),
  severity: severity.default("normal"),
  // A zero threshold silently sanctions every event (or creates a zero-length
  // rate window), so thresholds are always positive integers.
  thresholds: z.record(z.number().int().finite().min(1).max(100_000)).default({}),
});

type RuleThresholdDefault = { key: string; value: number; aliases?: string[] };
function ruleSchemaWithThresholdDefaults(...defaults: RuleThresholdDefault[]) {
  return RuleSchema.extend({
    thresholds: z.record(z.number().int().finite().min(1).max(100_000)).default({}).transform((saved) => {
      const thresholds = { ...saved };
      for (const { key, value, aliases = [] } of defaults) {
        // Older configurations may use a compatibility alias. Do not add a
        // preferred key in that case: it would take precedence and override
        // the operator's saved threshold.
        if (![key, ...aliases].some((candidate) => saved[candidate] !== undefined)) {
          thresholds[key] = value;
        }
      }
      return thresholds;
    }),
  });
}

type ThresholdBound = readonly [minimum: number, maximum: number];
function validateRuleThresholds(
  rule: { thresholds: Record<string, number> },
  path: Array<string | number>,
  allowed: Record<string, ThresholdBound>,
  ctx: z.RefinementCtx,
): void {
  for (const [key, value] of Object.entries(rule.thresholds)) {
    const bounds = allowed[key];
    if (!bounds) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "thresholds", key], message: `Unsupported threshold for this rule: ${key}` });
    } else if (value < bounds[0] || value > bounds[1]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, "thresholds", key], message: `Threshold must be between ${bounds[0]} and ${bounds[1]}` });
    }
  }
}

const commandName = z.enum([
  "warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock",
  "unlock", "nick", "role",
]);

export const ActivityLogCategorySchema = z.enum([
  "messages", "members", "channels", "roles", "voice", "moderation", "security",
]);
export type ActivityLogCategory = z.infer<typeof ActivityLogCategorySchema>;

const activityLogCategories = z.object({
  messages: z.boolean().default(true),
  members: z.boolean().default(true),
  channels: z.boolean().default(true),
  roles: z.boolean().default(true),
  voice: z.boolean().default(true),
  moderation: z.boolean().default(true),
  security: z.boolean().default(true),
}).default({});

export const ModerationConfigSchema = z.object({
  // Global protection switch. Module settings remain stored while the
  // category is disabled so an operator can turn protection back on without
  // rebuilding every rule.
  protection: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
  // 1. AutoMod
  autoMod: z.object({
    enabled: z.boolean().default(false),
    scamFilter: z.object({
      enabled: z.boolean().default(false),
      action: z.enum(["delete", "mute", "kick"]).default("delete"),
    }).default({}),
    scamPhrases: textList.default([]),
    wordFilter: RuleSchema.default({}),
    linkBlock: RuleSchema.default({}),
    emojiLimit: ruleSchemaWithThresholdDefaults({ key: "emoji", value: 10, aliases: ["limit", "max"] }).default({}),
    capsLimit: ruleSchemaWithThresholdDefaults({ key: "capsPercent", value: 75, aliases: ["percent", "limit"] }).default({}),
    repeatBlock: ruleSchemaWithThresholdDefaults({ key: "repeat", value: 8, aliases: ["limit", "max"] }).default({}),
    forbiddenWords: textList.default([]),
    forbiddenLinks: textList.default([]),
  }).default({}),
  // 2. Anti-raid
  antiRaid: z.object({
    enabled: z.boolean().default(false),
    joinsPerMinute: z.number().int().min(1).max(10_000).default(10),
    accountAgeDays: z.number().int().min(0).max(3650).default(7),
    lockdown: z.boolean().default(false),
    alertChannelId: snowflake.nullable().default(null),
    rule: ruleSchemaWithThresholdDefaults(
      { key: "joins", value: 10, aliases: ["limit"] },
      { key: "windowSeconds", value: 60, aliases: ["window"] },
    ).default({}),
  }).default({}),
  // 3. Anti-spam
  antiSpam: z.object({
    enabled: z.boolean().default(false),
    message: ruleSchemaWithThresholdDefaults(
      { key: "messages", value: 5, aliases: ["limit", "max"] },
      { key: "windowMs", value: 5, aliases: ["window", "seconds"] },
    ).default({}),
    edit: ruleSchemaWithThresholdDefaults(
      { key: "limit", value: 5, aliases: ["edits", "max"] },
      { key: "windowMs", value: 10, aliases: ["window", "seconds"] },
    ).default({}),
    delete: ruleSchemaWithThresholdDefaults(
      { key: "limit", value: 5, aliases: ["deletes", "max"] },
      { key: "windowMs", value: 10, aliases: ["window", "seconds"] },
    ).default({}),
    mention: ruleSchemaWithThresholdDefaults({ key: "mentions", value: 5, aliases: ["limit", "max"] }).default({}),
    emoji: ruleSchemaWithThresholdDefaults({ key: "emoji", value: 10, aliases: ["limit", "max"] }).default({}),
    logChannelId: snowflake.nullable().default(null),
  }).default({}),
  // 4. Anti-flood
  antiFlood: z.object({
    enabled: z.boolean().default(false),
    longMessage: ruleSchemaWithThresholdDefaults({ key: "length", value: 1_500, aliases: ["maxLength", "limit"] }).default({}),
    character: ruleSchemaWithThresholdDefaults({ key: "run", value: 16, aliases: ["limit", "max"] }).default({}),
    caps: ruleSchemaWithThresholdDefaults({ key: "capsPercent", value: 75, aliases: ["percent", "limit"] }).default({}),
    symbol: ruleSchemaWithThresholdDefaults({ key: "run", value: 16, aliases: ["limit", "max"] }).default({}),
  }).default({}),
  // 5. Manual staff tools and independent command grants
  manualTools: z.object({
    enabled: z.boolean().default(false),
    commandGrants: z.record(commandName, idList).default({}),
    logActions: z.boolean().default(false),
  }).default({}),
  // 6. Cases
  cases: z.object({
    enabled: z.boolean().default(false),
    allowStaffClose: z.boolean().default(true),
    allowStaffNotes: z.boolean().default(true),
    allowStaffExport: z.boolean().default(false),
    retentionDays: z.number().int().min(1).max(3650).default(365),
  }).default({}),
  // 7. Audit
  audit: z.object({
    enabled: z.boolean().default(false),
    detailLevel: z.enum(["minimal", "standard", "verbose"]).default("standard"),
    channelId: snowflake.nullable().default(null),
  }).default({}),
  // Automatic server activity logs are independent from the existing
  // moderation-audit switch. Destinations are guild-scoped with this config.
  activityLog: z.object({
    enabled: z.boolean().default(false),
    categories: activityLogCategories,
    roleIds: idList.default([]),
    categoryId: snowflake.nullable().default(null),
    channelIds: z.object({
      messages: snowflake.nullable().default(null),
      members: snowflake.nullable().default(null),
      channels: snowflake.nullable().default(null),
      roles: snowflake.nullable().default(null),
      voice: snowflake.nullable().default(null),
      moderation: snowflake.nullable().default(null),
      security: snowflake.nullable().default(null),
    }).default({}),
  }).default({}).superRefine((activityLog, ctx) => {
    if (activityLog.enabled && !Object.values(activityLog.categories).some(Boolean)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categories"],
        message: "Selectează cel puțin o categorie pentru jurnalul Discord.",
      });
    }
    if (activityLog.enabled && activityLog.roleIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roleIds"],
        message: "Selectează cel puțin un rol care poate vedea canalele private de jurnal.",
      });
    }
  }),
  // 8. Roles
  roles: z.object({
    sanctionableRoleIds: idList.default([]),
    protectedRoleIds: idList.default([]),
    ignoredAutoModRoleIds: idList.default([]),
    specialPermissionRoleIds: idList.default([]),
  }).default({}),
  // 9. Channels
  channels: z.object({
    ignoredChannelIds: idList.default([]),
    protectedChannelIds: idList.default([]),
    autoSlowmodeChannelIds: idList.default([]),
    strictChannelIds: idList.default([]),
    softChannelIds: idList.default([]),
  }).default({}),
  // 10. Time profiles
  timeProfiles: z.object({
    timezone: z.string().trim().min(1).max(64).refine((timezone) => {
      try { Intl.DateTimeFormat(undefined, { timeZone: timezone }); return true; } catch { return false; }
    }, "Timezone must be a valid IANA timezone").default("UTC"),
    strictNight: z.object({ enabled: z.boolean().default(false), startHour: z.number().int().min(0).max(23).default(22), endHour: z.number().int().min(0).max(23).default(7) }).default({}),
    softDay: z.object({ enabled: z.boolean().default(false), startHour: z.number().int().min(0).max(23).default(8), endHour: z.number().int().min(0).max(23).default(21) }).default({}),
    weekend: z.object({ enabled: z.boolean().default(false), severity: severity.default("normal") }).default({}),
    majorEvent: z.object({ enabled: z.boolean().default(false), severity: severity.default("hard") }).default({}),
  }).default({}),
  // 11. Suspicious behaviour
  suspiciousBehavior: z.object({
    enabled: z.boolean().default(false),
    sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
    action: action.default("none"),
    alertChannelId: snowflake.nullable().default(null),
    nicknameChanges: ruleSchemaWithThresholdDefaults({ key: "limit", value: 5, aliases: ["changes"] }).default({}),
    roleChanges: ruleSchemaWithThresholdDefaults({ key: "limit", value: 5, aliases: ["changes"] }).default({}),
    massEdits: ruleSchemaWithThresholdDefaults({ key: "limit", value: 5, aliases: ["changes"] }).default({}),
    massDeletes: ruleSchemaWithThresholdDefaults({ key: "limit", value: 5, aliases: ["changes"] }).default({}),
    joinLeaveFlood: ruleSchemaWithThresholdDefaults({ key: "limit", value: 10, aliases: ["changes"] }).default({}),
    unusualActivity: ruleSchemaWithThresholdDefaults({ key: "limit", value: 5, aliases: ["changes"] }).default({}),
  }).default({}),
  // 12. AI moderation
  ai: z.object({
    enabled: z.boolean().default(false),
    sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
    tone: z.enum(["serious", "calm", "strict"]).default("calm"),
    action: action.default("none"),
    logChannelId: snowflake.nullable().default(null),
    categories: z.object({
      toxicity: z.boolean().default(false),
      profanity: z.boolean().default(false),
      attacks: z.boolean().default(false),
      bullying: z.boolean().default(false),
      intelligentSpam: z.boolean().default(false),
      trolling: z.boolean().default(false),
    }).default({}),
  }).default({}),
  // 13. Multi-server isolation
  multiServer: z.object({
    enabled: z.boolean().default(false),
    // Guild scoping is a privacy invariant, not an operator-selectable mode.
    isolatedData: z.literal(true).default(true),
  }).default({}),
  // 14. Escalation levels
  escalation: z.object({
    enabled: z.boolean().default(false),
    resetAfterDays: z.number().int().min(1).max(3650).default(30),
    levels: z.array(z.object({
      level: z.number().int().min(1).max(4),
      violations: z.number().int().min(1).max(10_000),
      action,
    })).min(1).max(4).default([
      { level: 1, violations: 1, action: "warn" },
      { level: 2, violations: 2, action: "mute" },
      { level: 3, violations: 3, action: "kick" },
      { level: 4, violations: 4, action: "ban" },
    ]),
  }).default({}),
  // 15. Embed builder / visual moderation
  embeds: z.object({
    enabled: z.boolean().default(false),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5865F2"),
    iconUrl: safeHttpsUrl.nullable().default(null),
    titleTemplate: z.string().max(200).default("Moderation action"),
    descriptionTemplate: z.string().max(2_000).default("{action}: {reason}"),
    style: z.enum(["plain", "compact", "detailed"]).default("plain"),
    animations: z.boolean().default(false),
    animationUrl: safeGifUrl.nullable().default(null),
  }).default({}).refine((embed) => !embed.animations || Boolean(embed.animationUrl), {
    message: "An HTTPS GIF animationUrl is required when animations are enabled",
    path: ["animationUrl"],
  }),
  // Discord moderation is slash-command based. Prefix is intentionally
  // read-only rather than storing a non-functional custom prefix.
  bot: z.object({ prefix: z.literal("/").default("/") }).default({}),
  permissions: z.object({
    staffRoleIds: idList.default([]),
    allowManageGuild: z.boolean().default(true),
    allowAdminsSettings: z.boolean().default(false),
  }).default({}),
}).superRefine((config, ctx) => {
  validateRuleThresholds(config.autoMod.wordFilter, ["autoMod", "wordFilter"], { matches: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.linkBlock, ["autoMod", "linkBlock"], { matches: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.emojiLimit, ["autoMod", "emojiLimit"], { emoji: [1, 200], limit: [1, 200], max: [1, 200] }, ctx);
  validateRuleThresholds(config.autoMod.capsLimit, ["autoMod", "capsLimit"], { capsPercent: [1, 100], percent: [1, 100], limit: [1, 100] }, ctx);
  validateRuleThresholds(config.autoMod.repeatBlock, ["autoMod", "repeatBlock"], { repeat: [2, 200], limit: [2, 200], max: [2, 200] }, ctx);
  validateRuleThresholds(config.antiRaid.rule, ["antiRaid", "rule"], { joins: [1, 10_000], limit: [1, 10_000], windowSeconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.message, ["antiSpam", "message"], { messages: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.edit, ["antiSpam", "edit"], { edits: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.delete, ["antiSpam", "delete"], { deletes: [1, 1_000], limit: [1, 1_000], max: [1, 1_000], windowMs: [1, 3_600], window: [1, 3_600], seconds: [1, 3_600] }, ctx);
  validateRuleThresholds(config.antiSpam.mention, ["antiSpam", "mention"], { mentions: [1, 100], limit: [1, 100], max: [1, 100] }, ctx);
  validateRuleThresholds(config.antiSpam.emoji, ["antiSpam", "emoji"], { emoji: [1, 200], limit: [1, 200], max: [1, 200] }, ctx);
  validateRuleThresholds(config.antiFlood.longMessage, ["antiFlood", "longMessage"], { length: [1, 10_000], maxLength: [1, 10_000], limit: [1, 10_000] }, ctx);
  validateRuleThresholds(config.antiFlood.character, ["antiFlood", "character"], { run: [2, 2_000], limit: [2, 2_000], max: [2, 2_000] }, ctx);
  validateRuleThresholds(config.antiFlood.caps, ["antiFlood", "caps"], { capsPercent: [1, 100], percent: [1, 100], limit: [1, 100] }, ctx);
  validateRuleThresholds(config.antiFlood.symbol, ["antiFlood", "symbol"], { run: [2, 2_000], limit: [2, 2_000], max: [2, 2_000] }, ctx);
  for (const key of ["nicknameChanges", "roleChanges", "massEdits", "massDeletes", "joinLeaveFlood", "unusualActivity"] as const) {
    validateRuleThresholds(config.suspiciousBehavior[key], ["suspiciousBehavior", key], { changes: [1, 1_000], limit: [1, 1_000] }, ctx);
  }
});

export type ModerationConfig = z.infer<typeof ModerationConfigSchema>;
export type ModerationAction = z.infer<typeof action>;
export type ModerationCommand = z.infer<typeof commandName>;

export const defaultModerationConfig: ModerationConfig = ModerationConfigSchema.parse({});

export function parseModerationConfig(value: unknown): ModerationConfig {
  return ModerationConfigSchema.parse(value);
}