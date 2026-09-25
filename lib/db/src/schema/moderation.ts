import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const moderationConfigsTable = pgTable("moderation_configs", {
  guildId: text("guild_id").primaryKey(),
  config: jsonb("config").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationLoginCodesTable = pgTable(
  "moderation_login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("moderation_login_codes_hash_idx").on(table.codeHash)],
);

export const moderationSessionsTable = pgTable(
  "moderation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("moderation_sessions_token_idx").on(table.tokenHash)],
);

export const moderationCasesTable = pgTable(
  "moderation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    subjectId: text("subject_id").notNull(),
    actorId: text("actor_id"),
    actionType: text("action_type").notNull(),
    reason: text("reason"),
    evidence: jsonb("evidence").notNull().default([]),
    status: text("status").notNull().default("open"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
  },
  (table) => [
    index("moderation_cases_guild_created_idx").on(table.guildId, table.createdAt),
    index("moderation_cases_guild_subject_idx").on(table.guildId, table.subjectId),
  ],
);

export const moderationCaseNotesTable = pgTable(
  "moderation_case_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull(),
    guildId: text("guild_id").notNull(),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("moderation_case_notes_case_idx").on(table.caseId, table.createdAt)],
);

export const moderationAuditLogsTable = pgTable(
  "moderation_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("moderation_audit_guild_created_idx").on(table.guildId, table.createdAt)],
);

export const moderationLockdownsTable = pgTable(
  "moderation_lockdowns",
  {
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    overwrites: jsonb("overwrites").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.channelId] })],
);

export const moderationOffensesTable = pgTable(
  "moderation_offenses",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    count: integer("count").notNull().default(0),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const moderationActionLedgerTable = pgTable(
  "moderation_action_ledger",
  {
    id: uuid("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    actorId: text("actor_id").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").notNull(),
    input: jsonb("input").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("moderation_action_ledger_guild_key_unique").on(table.guildId, table.idempotencyKey),
    index("moderation_action_ledger_guild_created_idx").on(table.guildId, table.createdAt),
  ],
);

export type ModerationConfigRow = typeof moderationConfigsTable.$inferSelect;
export type ModerationCaseRow = typeof moderationCasesTable.$inferSelect;
export type ModerationCaseNoteRow = typeof moderationCaseNotesTable.$inferSelect;
export type ModerationAuditLogRow = typeof moderationAuditLogsTable.$inferSelect;