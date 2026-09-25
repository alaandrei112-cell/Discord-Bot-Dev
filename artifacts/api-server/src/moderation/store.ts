import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  defaultModerationConfig,
  EvidenceSchema,
  parseModerationConfig,
  type ModerationConfig,
} from "./config";
import { ModerationRevisionConflictError } from "./errors";

export type CaseStatus = "open" | "closed";

export interface ModerationCase {
  id: string;
  guildId: string;
  subjectId: string;
  actorId: string | null;
  actionType: string;
  reason: string | null;
  evidence: unknown[];
  status: CaseStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  closedBy: string | null;
}

export interface ModerationCaseNote {
  id: string;
  caseId: string;
  guildId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface ModerationAuditLog {
  id: string;
  guildId: string;
  actorId: string | null;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
}

export type ModerationAuditCategory =
  | "all"
  | "messages"
  | "members"
  | "channels"
  | "roles"
  | "voice"
  | "moderation"
  | "security"
  | "other";

export interface ModerationAuditFilters {
  search: string;
  category: ModerationAuditCategory;
  start?: Date;
  end?: Date;
  limit: number;
  offset: number;
}

export interface ModerationAuditPage {
  items: ModerationAuditLog[];
  total: number;
}

export interface ModerationSession {
  id: string;
  userId: string;
  tokenHash: string;
  csrfToken: string;
  expiresAt: Date;
  revokedAt: Date | null;
}
export interface ModerationActionLedger {
  id: string; guildId: string; idempotencyKey: string; actorId: string; actionType: string;
  status: "pending" | "uncertain" | "applied" | "failed"; input: Record<string, unknown>;
  result: Record<string, unknown> | null; error: string | null; createdAt: Date; updatedAt: Date;
}

export interface ModerationStore {
  ensureSchema(): Promise<void>;
  getConfig(guildId: string): Promise<{ config: ModerationConfig; version: number; updatedAt: Date | null }>;
  putConfig(guildId: string, config: ModerationConfig, updatedBy: string, expectedVersion: number): Promise<{ config: ModerationConfig; version: number }>;
  putProtectionToggle(
    guildId: string,
    key: ProtectionToggleKey,
    enabled: boolean,
    updatedBy: string,
  ): Promise<{ config: ModerationConfig; previousConfig: ModerationConfig; version: number }>;
  createLoginCode(input: { guildId: string; userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
  consumeLoginCode(codeHash: string): Promise<{ guildId: string; userId: string } | null>;
  createSession(input: Omit<ModerationSession, "revokedAt">): Promise<void>;
  getSession(tokenHash: string): Promise<ModerationSession | null>;
  revokeSession(tokenHash: string): Promise<void>;
  listCases(guildId: string, filters: { status?: CaseStatus; userId?: string; limit: number; offset: number }): Promise<ModerationCase[]>;
  getCase(guildId: string, caseId: string): Promise<ModerationCase | null>;
  createCase(input: {
    guildId: string; subjectId: string; actorId: string | null; actionType: string;
    reason?: string; evidence?: unknown[]; metadata?: Record<string, unknown>;
  }): Promise<ModerationCase>;
  updateCase(input: { guildId: string; caseId: string; status?: CaseStatus; reason?: string; evidence?: unknown[]; actorId: string }): Promise<ModerationCase | null>;
  addCaseNote(input: { guildId: string; caseId: string; authorId: string; body: string }): Promise<ModerationCaseNote | null>;
  listCaseNotes(guildId: string, caseId: string): Promise<ModerationCaseNote[]>;
  pruneCases(guildId: string, retentionDays: number): Promise<number>;
  listAudit(guildId: string, filters: ModerationAuditFilters): Promise<ModerationAuditPage>;
  listModerationLogs(guildId: string, limit: number, offset: number): Promise<ModerationAuditLog[]>;
  writeAudit(input: Omit<ModerationAuditLog, "id" | "createdAt">): Promise<void>;
  beginAction(input: { guildId: string; idempotencyKey: string; actorId: string; actionType: string; input: Record<string, unknown> }): Promise<{ created: boolean; action: ModerationActionLedger }>;
  getAction(guildId: string, idempotencyKey: string): Promise<ModerationActionLedger | null>;
  listActions(guildId: string, status: "pending" | "uncertain" | "applied" | "failed" | undefined, limit: number, offset: number): Promise<ModerationActionLedger[]>;
  completeAction(id: string, status: "applied" | "failed" | "uncertain", result?: Record<string, unknown>, error?: string): Promise<void>;
  reconcileAction(input: { guildId: string; actionId: string; actorId: string; status: "applied" | "failed" | "uncertain"; note: string; confirmedOffense?: { userId: string; resetAfterDays: number } }): Promise<ModerationActionLedger | null>;
  finalizeAction(input: { guildId: string; actionId: string; actorId: string; status: "applied" | "failed" | "uncertain"; caseId?: string; outcome: string; result?: Record<string, unknown>; error?: string; confirmedOffense?: { userId: string; resetAfterDays: number } }): Promise<{ offenseCount?: number }>;
  recordConfirmedOffense(input: { guildId: string; userId: string; resetAfterDays: number }): Promise<number>;
}

export type ProtectionToggleKey =
  | "protection" | "autoMod" | "wordFilter" | "linkBlock"
  | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai"
  | "manualTools" | "cases" | "audit" | "escalation" | "embeds";

let schemaPromise: Promise<void> | undefined;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function caseFromRow(row: Record<string, unknown>): ModerationCase {
  return {
    id: String(row.id), guildId: String(row.guild_id), subjectId: String(row.subject_id),
    actorId: row.actor_id ? String(row.actor_id) : null, actionType: String(row.action_type),
    reason: row.reason ? String(row.reason) : null,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    status: row.status === "closed" ? "closed" : "open",
    metadata: asObject(row.metadata), createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date, closedAt: (row.closed_at as Date | null) ?? null,
    closedBy: row.closed_by ? String(row.closed_by) : null,
  };
}

function auditFromRow(row: Record<string, unknown>): ModerationAuditLog {
  return {
    id: String(row.id), guildId: String(row.guild_id),
    actorId: row.actor_id ? String(row.actor_id) : null, eventType: String(row.event_type),
    targetType: row.target_type ? String(row.target_type) : null,
    targetId: row.target_id ? String(row.target_id) : null,
    detail: asObject(row.detail), createdAt: row.created_at as Date,
  };
}

function ledgerFromRow(row: Record<string, unknown>): ModerationActionLedger {
  const status = row.status;
  return {
    id: String(row.id), guildId: String(row.guild_id), idempotencyKey: String(row.idempotency_key),
    actorId: String(row.actor_id), actionType: String(row.action_type),
    status: status === "applied" || status === "failed" || status === "uncertain" ? status : "pending",
    input: asObject(row.input), result: row.result ? asObject(row.result) : null,
    error: row.error ? String(row.error) : null, createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export class PostgresModerationStore implements ModerationStore {
  async ensureSchema(): Promise<void> {
    schemaPromise ??= (async () => {
      // Additive, idempotent bootstrap. This deliberately does not invoke
      // drizzle-kit push, which can attempt unrelated destructive changes.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS moderation_configs (
          guild_id text PRIMARY KEY, config jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
          updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS moderation_login_codes (
          id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL,
          code_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
          used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS moderation_sessions (
          id uuid PRIMARY KEY, user_id text NOT NULL, token_hash text NOT NULL UNIQUE,
          csrf_token text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS moderation_cases (
          id uuid PRIMARY KEY, guild_id text NOT NULL, subject_id text NOT NULL, actor_id text,
          action_type text NOT NULL, reason text, evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
          status text NOT NULL DEFAULT 'open', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          closed_at timestamptz, closed_by text
        );
        CREATE TABLE IF NOT EXISTS moderation_case_notes (
          id uuid PRIMARY KEY, case_id uuid NOT NULL, guild_id text NOT NULL, author_id text NOT NULL,
          body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS moderation_audit_logs (
          id uuid PRIMARY KEY, guild_id text NOT NULL, actor_id text, event_type text NOT NULL,
          target_type text, target_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS moderation_lockdowns (
          guild_id text NOT NULL, channel_id text NOT NULL, overwrites jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (guild_id, channel_id)
        );
        CREATE TABLE IF NOT EXISTS moderation_offenses (
          guild_id text NOT NULL, user_id text NOT NULL, count integer NOT NULL DEFAULT 0,
          last_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (guild_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS moderation_action_ledger (
          id uuid PRIMARY KEY, guild_id text NOT NULL, idempotency_key text NOT NULL, actor_id text NOT NULL,
          action_type text NOT NULL, status text NOT NULL, input jsonb NOT NULL, result jsonb, error text,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (guild_id, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS moderation_login_codes_hash_idx ON moderation_login_codes (code_hash);
        CREATE INDEX IF NOT EXISTS moderation_sessions_token_idx ON moderation_sessions (token_hash);
        CREATE INDEX IF NOT EXISTS moderation_cases_guild_created_idx ON moderation_cases (guild_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS moderation_cases_guild_subject_idx ON moderation_cases (guild_id, subject_id);
        CREATE INDEX IF NOT EXISTS moderation_case_notes_case_idx ON moderation_case_notes (case_id, created_at);
        CREATE INDEX IF NOT EXISTS moderation_audit_guild_created_idx ON moderation_audit_logs (guild_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS moderation_action_ledger_guild_created_idx ON moderation_action_ledger (guild_id, created_at DESC);
      `);
    })();
    return schemaPromise;
  }

  async getConfig(guildId: string) {
    await this.ensureSchema();
    const { rows } = await pool.query<{ config: unknown; version: number; updated_at: Date }>(
      "SELECT config, version, updated_at FROM moderation_configs WHERE guild_id = $1",
      [guildId],
    );
    const row = rows[0];
    return row
      ? { config: parseModerationConfig(row.config), version: row.version, updatedAt: row.updated_at }
      : { config: defaultModerationConfig, version: 0, updatedAt: null };
  }

  async putConfig(guildId: string, config: ModerationConfig, updatedBy: string, expectedVersion: number) {
    await this.ensureSchema();
    const client = await pool.connect();
    let version: number;
    try {
      await client.query("BEGIN");
      // INSERT ... SELECT WHERE expectedVersion = 0 cannot reach ON CONFLICT
      // for any subsequent save: the SELECT produces no row at all. Use a
      // version-guarded UPDATE for existing rows and a guarded INSERT for the
      // first write. Both return no row on a stale revision.
      const { rows } = expectedVersion === 0
        ? await client.query<{ version: number }>(
          `INSERT INTO moderation_configs (guild_id, config, version, updated_by, updated_at)
           VALUES ($1, $2::jsonb, 1, $3, now())
           ON CONFLICT (guild_id) DO NOTHING RETURNING version`,
          [guildId, JSON.stringify(config), updatedBy],
        )
        : await client.query<{ version: number }>(
          `UPDATE moderation_configs SET config = $2::jsonb, updated_by = $3,
             updated_at = now(), version = version + 1
           WHERE guild_id = $1 AND version = $4 RETURNING version`,
          [guildId, JSON.stringify(config), updatedBy, expectedVersion],
        );
      if (!rows[0]) throw new ModerationRevisionConflictError();
      await this.insertAudit(client, {
        guildId, actorId: updatedBy, eventType: "config.updated", targetType: "config",
        targetId: guildId, detail: { version: rows[0].version },
      });
      await client.query("COMMIT");
      version = rows[0].version;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Retention is best-effort housekeeping after the config and audit commit.
    // It must not turn a committed write into a reported failure.
    try {
      await this.pruneCases(guildId, config.cases.retentionDays);
    } catch (error) {
      logger.warn({ error, guildId }, "Moderation case retention failed after config save");
    }
    return { config, version };
  }

  async putProtectionToggle(
    guildId: string,
    key: ProtectionToggleKey,
    enabled: boolean,
    updatedBy: string,
  ) {
    await this.ensureSchema();
    const client = await pool.connect();
    let saved: { config: ModerationConfig; previousConfig: ModerationConfig; version: number };
    try {
      await client.query("BEGIN");
      // Serialize first-write toggles too. FOR UPDATE cannot lock a row that
      // does not exist yet, so an advisory transaction lock closes that gap.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [guildId]);
      const { rows } = await client.query<{ config: unknown; version: number }>(
        "SELECT config, version FROM moderation_configs WHERE guild_id = $1 FOR UPDATE",
        [guildId],
      );
      const current = rows[0]
        ? { config: parseModerationConfig(rows[0].config), version: rows[0].version }
        : { config: defaultModerationConfig, version: 0 };
      const nextConfig: ModerationConfig = { ...current.config };

      if (key === "protection") {
        nextConfig.protection = { ...current.config.protection, enabled };
      } else if (key === "autoMod") {
        nextConfig.autoMod = { ...current.config.autoMod, enabled };
      } else if (key === "wordFilter" || key === "linkBlock") {
        nextConfig.autoMod = {
          ...current.config.autoMod,
          // Turning on a child rule must also turn on its AutoMod parent.
          enabled: enabled ? true : current.config.autoMod.enabled,
          [key]: { ...current.config.autoMod[key], enabled },
        };
      } else if (key === "antiRaid") {
        nextConfig.antiRaid = { ...current.config.antiRaid, enabled };
      } else if (key === "antiSpam") {
        nextConfig.antiSpam = { ...current.config.antiSpam, enabled };
      } else if (key === "antiFlood") {
        nextConfig.antiFlood = { ...current.config.antiFlood, enabled };
      } else if (key === "suspiciousBehavior") {
        nextConfig.suspiciousBehavior = { ...current.config.suspiciousBehavior, enabled };
      } else if (key === "ai") {
        nextConfig.ai = { ...current.config.ai, enabled };
      } else if (key === "manualTools") {
        nextConfig.manualTools = { ...current.config.manualTools, enabled };
      } else if (key === "cases") {
        nextConfig.cases = { ...current.config.cases, enabled };
      } else if (key === "audit") {
        nextConfig.audit = { ...current.config.audit, enabled };
      } else if (key === "escalation") {
        nextConfig.escalation = { ...current.config.escalation, enabled };
      } else {
        nextConfig.embeds = { ...current.config.embeds, enabled };
      }

      const nextVersion = current.version + 1;
      await client.query(
        `INSERT INTO moderation_configs (guild_id, config, version, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, now())
         ON CONFLICT (guild_id) DO UPDATE SET config = EXCLUDED.config,
           version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [guildId, JSON.stringify(nextConfig), nextVersion, updatedBy],
      );
      await this.insertAudit(client, {
        guildId,
        actorId: updatedBy,
        eventType: "config.updated",
        targetType: "config",
        targetId: guildId,
        detail: { version: nextVersion, protectionToggle: key, enabled },
      });
      await client.query("COMMIT");
      saved = { config: nextConfig, previousConfig: current.config, version: nextVersion };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    try {
      await this.pruneCases(guildId, saved.config.cases.retentionDays);
    } catch (error) {
      logger.warn({ error, guildId }, "Moderation case retention failed after protection toggle");
    }
    return saved;
  }

  async createLoginCode(input: { guildId: string; userId: string; codeHash: string; expiresAt: Date }) {
    await this.ensureSchema();
    await pool.query(
      "INSERT INTO moderation_login_codes (id, guild_id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [randomUUID(), input.guildId, input.userId, input.codeHash, input.expiresAt],
    );
  }

  async consumeLoginCode(codeHash: string) {
    await this.ensureSchema();
    const { rows } = await pool.query<{ guild_id: string; user_id: string }>(
      `UPDATE moderation_login_codes SET used_at = now()
       WHERE id = (SELECT id FROM moderation_login_codes
         WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING guild_id, user_id`,
      [codeHash],
    );
    return rows[0] ? { guildId: rows[0].guild_id, userId: rows[0].user_id } : null;
  }

  async createSession(input: Omit<ModerationSession, "revokedAt">) {
    await this.ensureSchema();
    await pool.query(
      "INSERT INTO moderation_sessions (id, user_id, token_hash, csrf_token, expires_at) VALUES ($1, $2, $3, $4, $5)",
      [input.id, input.userId, input.tokenHash, input.csrfToken, input.expiresAt],
    );
  }

  async getSession(tokenHash: string): Promise<ModerationSession | null> {
    await this.ensureSchema();
    const { rows } = await pool.query<ModerationSession>(
      `UPDATE moderation_sessions SET last_seen_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
       RETURNING id, user_id AS "userId", token_hash AS "tokenHash", csrf_token AS "csrfToken",
         expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async revokeSession(tokenHash: string) {
    await this.ensureSchema();
    await pool.query("UPDATE moderation_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash]);
  }

  async listCases(guildId: string, filters: { status?: CaseStatus; userId?: string; limit: number; offset: number }) {
    await this.ensureSchema();
    const params: unknown[] = [guildId];
    const clauses = ["guild_id = $1"];
    if (filters.status) { params.push(filters.status); clauses.push(`status = $${params.length}`); }
    if (filters.userId) { params.push(filters.userId); clauses.push(`subject_id = $${params.length}`); }
    params.push(filters.limit, filters.offset);
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM moderation_cases WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows.map(caseFromRow);
  }

  async getCase(guildId: string, caseId: string) {
    await this.ensureSchema();
    const { rows } = await pool.query<Record<string, unknown>>(
      "SELECT * FROM moderation_cases WHERE guild_id = $1 AND id = $2", [guildId, caseId],
    );
    return rows[0] ? caseFromRow(rows[0]) : null;
  }

  async createCase(input: {
    guildId: string; subjectId: string; actorId: string | null; actionType: string;
    reason?: string; evidence?: unknown[]; metadata?: Record<string, unknown>;
  }) {
    const evidence = EvidenceSchema.parse(input.evidence ?? []);
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Record<string, unknown>>(
        `INSERT INTO moderation_cases (id, guild_id, subject_id, actor_id, action_type, reason, evidence, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) RETURNING *`,
        [randomUUID(), input.guildId, input.subjectId, input.actorId, input.actionType,
          input.reason ?? null, JSON.stringify(evidence), JSON.stringify(input.metadata ?? {})],
      );
      await this.insertAudit(client, {
        guildId: input.guildId, actorId: input.actorId, eventType: "case.created",
        targetType: "case", targetId: String(rows[0].id), detail: { actionType: input.actionType },
      });
      await client.query("COMMIT");
      return caseFromRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateCase(input: { guildId: string; caseId: string; status?: CaseStatus; reason?: string; evidence?: unknown[]; actorId: string }) {
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Record<string, unknown>>(
        `UPDATE moderation_cases SET status = COALESCE($3, status), reason = COALESCE($4, reason),
          evidence = COALESCE($5::jsonb, evidence),
          updated_at = now(), closed_at = CASE WHEN $3 = 'closed' THEN now() ELSE closed_at END,
          closed_by = CASE WHEN $3 = 'closed' THEN $6 ELSE closed_by END
         WHERE guild_id = $1 AND id = $2 RETURNING *`,
        [input.guildId, input.caseId, input.status ?? null, input.reason ?? null,
          input.evidence === undefined ? null : JSON.stringify(EvidenceSchema.parse(input.evidence)), input.actorId],
      );
      if (!rows[0]) { await client.query("ROLLBACK"); return null; }
      await this.insertAudit(client, {
        guildId: input.guildId, actorId: input.actorId, eventType: "case.updated",
        targetType: "case", targetId: input.caseId, detail: { status: input.status, reasonChanged: input.reason !== undefined, evidenceChanged: input.evidence !== undefined },
      });
      await client.query("COMMIT");
      return caseFromRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async addCaseNote(input: { guildId: string; caseId: string; authorId: string; body: string }) {
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT 1 FROM moderation_cases WHERE guild_id = $1 AND id = $2", [input.guildId, input.caseId]);
      if (!exists.rowCount) { await client.query("ROLLBACK"); return null; }
      const id = randomUUID();
      const { rows } = await client.query<ModerationCaseNote>(
        `INSERT INTO moderation_case_notes (id, case_id, guild_id, author_id, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, case_id AS "caseId", guild_id AS "guildId", author_id AS "authorId", body, created_at AS "createdAt"`,
        [id, input.caseId, input.guildId, input.authorId, input.body],
      );
      await this.insertAudit(client, {
        guildId: input.guildId, actorId: input.authorId, eventType: "case.note_added",
        targetType: "case", targetId: input.caseId, detail: {},
      });
      await client.query("COMMIT");
      return rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCaseNotes(guildId: string, caseId: string) {
    await this.ensureSchema();
    const { rows } = await pool.query<ModerationCaseNote>(
      `SELECT id, case_id AS "caseId", guild_id AS "guildId", author_id AS "authorId", body, created_at AS "createdAt"
       FROM moderation_case_notes WHERE guild_id = $1 AND case_id = $2 ORDER BY created_at ASC`,
      [guildId, caseId],
    );
    return rows;
  }

  async pruneCases(guildId: string, retentionDays: number): Promise<number> {
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>(
        `DELETE FROM moderation_cases
         WHERE guild_id = $1 AND created_at < now() - ($2::integer * interval '1 day')
         RETURNING id`,
        [guildId, retentionDays],
      );
      if (rows.length) {
        await client.query(
          "DELETE FROM moderation_case_notes WHERE guild_id = $1 AND case_id = ANY($2::uuid[])",
          [guildId, rows.map((row) => row.id)],
        );
        await this.insertAudit(client, {
          guildId, actorId: null, eventType: "cases.pruned", targetType: "case",
          targetId: null, detail: { count: rows.length, retentionDays },
        });
      }
      await client.query("COMMIT");
      return rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAudit(guildId: string, filters: ModerationAuditFilters): Promise<ModerationAuditPage> {
    await this.ensureSchema();
    const values: unknown[] = [guildId];
    const conditions = ["guild_id = $1"];
    const addValue = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (filters.start) conditions.push(`created_at >= ${addValue(filters.start)}`);
    if (filters.end) conditions.push(`created_at <= ${addValue(filters.end)}`);
    if (filters.category !== "all") {
      const categoryParam = addValue(filters.category);
      conditions.push(`(
        CASE
          WHEN lower(event_type) LIKE 'discord.message%' THEN 'messages'
          WHEN lower(event_type) LIKE 'discord.member%' THEN 'members'
          WHEN lower(event_type) LIKE 'discord.channel%' THEN 'channels'
          WHEN lower(event_type) LIKE 'discord.guild_role%' OR lower(event_type) LIKE 'discord.guildrole%' THEN 'roles'
          WHEN lower(event_type) LIKE 'discord.voice%' THEN 'voice'
          WHEN lower(event_type) LIKE 'config.%' OR lower(event_type) LIKE 'case.%'
            OR lower(event_type) LIKE 'cases.%' OR lower(event_type) LIKE 'action.%' THEN 'moderation'
          WHEN lower(event_type) LIKE 'raid.%' OR lower(event_type) LIKE 'suspicious.%'
            OR lower(event_type) LIKE 'spam.%' OR lower(event_type) LIKE 'automod.%'
            OR lower(event_type) LIKE 'ai.%' OR lower(event_type) LIKE 'event.%' THEN 'security'
          ELSE 'other'
        END
      ) = ${categoryParam}`);
    }
    if (filters.search) {
      const searchParam = addValue(filters.search);
      conditions.push(`position(lower(${searchParam}) in lower(concat_ws(
        ' ', event_type, actor_id, target_type, target_id, detail::text
      ))) > 0`);
    }

    const where = conditions.join(" AND ");
    const countValues = [...values];
    const pageLimit = addValue(filters.limit);
    const pageOffset = addValue(filters.offset);
    const [countResult, pageResult] = await Promise.all([
      pool.query<{ total: string | number }>(
        `SELECT COUNT(*) AS total FROM moderation_audit_logs WHERE ${where}`,
        countValues,
      ),
      pool.query<Record<string, unknown>>(
        `SELECT * FROM moderation_audit_logs
         WHERE ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ${pageLimit} OFFSET ${pageOffset}`,
        values,
      ),
    ]);
    return {
      items: pageResult.rows.map(auditFromRow),
      total: Number(countResult.rows[0]?.total ?? 0),
    };
  }

  async listModerationLogs(guildId: string, limit: number, offset: number) {
    await this.ensureSchema();
    // This staff-facing feed intentionally excludes owner-only configuration
    // and case-management audit events. It contains actual enforcement output.
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM moderation_audit_logs
       WHERE guild_id = $1 AND (
         event_type LIKE 'action.%' OR event_type LIKE 'automod.%' OR
         event_type LIKE 'ai.%' OR event_type LIKE 'raid.%'
       )
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [guildId, limit, offset],
    );
    return rows.map(auditFromRow);
  }

  async writeAudit(input: Omit<ModerationAuditLog, "id" | "createdAt">) {
    await this.ensureSchema();
    await this.insertAudit(pool, input);
  }

  async beginAction(input: { guildId: string; idempotencyKey: string; actorId: string; actionType: string; input: Record<string, unknown> }) {
    await this.ensureSchema();
    const id = randomUUID();
    const { rows } = await pool.query<Record<string, unknown>>(
      `INSERT INTO moderation_action_ledger (id, guild_id, idempotency_key, actor_id, action_type, status, input)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)
       ON CONFLICT (guild_id, idempotency_key) DO NOTHING RETURNING *`,
      [id, input.guildId, input.idempotencyKey, input.actorId, input.actionType, JSON.stringify(input.input)],
    );
    if (rows[0]) return { created: true, action: ledgerFromRow(rows[0]) };
    const existing = await pool.query<Record<string, unknown>>(
      "SELECT * FROM moderation_action_ledger WHERE guild_id = $1 AND idempotency_key = $2",
      [input.guildId, input.idempotencyKey],
    );
    if (!existing.rows[0]) throw new Error("Action ledger conflict could not be resolved");
    return { created: false, action: ledgerFromRow(existing.rows[0]) };
  }

  async getAction(guildId: string, idempotencyKey: string) {
    await this.ensureSchema();
    const { rows } = await pool.query<Record<string, unknown>>(
      "SELECT * FROM moderation_action_ledger WHERE guild_id = $1 AND idempotency_key = $2",
      [guildId, idempotencyKey],
    );
    return rows[0] ? ledgerFromRow(rows[0]) : null;
  }

  async listActions(guildId: string, status: "pending" | "uncertain" | "applied" | "failed" | undefined, limit: number, offset: number) {
    await this.ensureSchema();
    const params: unknown[] = [guildId, limit, offset];
    const where = status ? "guild_id = $1 AND status = $4" : "guild_id = $1";
    if (status) params.push(status);
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM moderation_action_ledger WHERE ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      params,
    );
    return rows.map(ledgerFromRow);
  }

  async completeAction(id: string, status: "applied" | "failed" | "uncertain", result?: Record<string, unknown>, error?: string) {
    await this.ensureSchema();
    await pool.query(
      `UPDATE moderation_action_ledger SET status = $2, result = $3::jsonb, error = $4, updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id, status, result ? JSON.stringify(result) : null, error?.slice(0, 500) ?? null],
    );
  }

  async reconcileAction(input: { guildId: string; actionId: string; actorId: string; status: "applied" | "failed" | "uncertain"; note: string; confirmedOffense?: { userId: string; resetAfterDays: number } }) {
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<Record<string, unknown>>(
        `UPDATE moderation_action_ledger SET status = $3, error = $4, updated_at = now()
         WHERE guild_id = $1 AND id = $2 AND status IN ('pending', 'uncertain') RETURNING *`,
        [input.guildId, input.actionId, input.status, input.note],
      );
      if (!rows[0]) { await client.query("ROLLBACK"); return null; }
      await client.query(
        `UPDATE moderation_cases SET metadata = metadata || $3::jsonb, updated_at = now()
         WHERE guild_id = $1 AND metadata->>'ledgerActionId' = $2`,
        [input.guildId, input.actionId, JSON.stringify({ outcome: input.status, reconciled: true, reconciliationNote: input.note })],
      );
      if (input.status === "applied" && input.confirmedOffense) {
        const resetAt = new Date(Date.now() - input.confirmedOffense.resetAfterDays * 86_400_000);
        await client.query(
          `INSERT INTO moderation_offenses (guild_id, user_id, count, last_at) VALUES ($1, $2, 1, now())
           ON CONFLICT (guild_id, user_id) DO UPDATE SET count = CASE WHEN moderation_offenses.last_at < $3 THEN 1 ELSE moderation_offenses.count + 1 END, last_at = now()`,
          [input.guildId, input.confirmedOffense.userId, resetAt],
        );
      }
      await this.insertAudit(client, {
        guildId: input.guildId, actorId: input.actorId, eventType: "action.reconciled",
        targetType: "action_ledger", targetId: input.actionId, detail: { status: input.status, note: input.note },
      });
      await client.query("COMMIT");
      return ledgerFromRow(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeAction(input: { guildId: string; actionId: string; actorId: string; status: "applied" | "failed" | "uncertain"; caseId?: string; outcome: string; result?: Record<string, unknown>; error?: string; confirmedOffense?: { userId: string; resetAfterDays: number } }) {
    await this.ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const update = await client.query(
        `UPDATE moderation_action_ledger SET status = $3, result = $4::jsonb, error = $5, updated_at = now()
         WHERE guild_id = $1 AND id = $2 AND status = 'pending'`,
        [input.guildId, input.actionId, input.status, input.result ? JSON.stringify(input.result) : null, input.error?.slice(0, 500) ?? null],
      );
      if (!update.rowCount) throw new Error("Action ledger is no longer pending");
      if (input.caseId) {
        await client.query(
          `UPDATE moderation_cases SET metadata = metadata || $3::jsonb, updated_at = now()
           WHERE guild_id = $1 AND id = $2`,
          [input.guildId, input.caseId, JSON.stringify({ outcome: input.outcome, ledgerActionId: input.actionId })],
        );
      }
      let offenseCount: number | undefined;
      if (input.confirmedOffense && input.status === "applied") {
        const resetAt = new Date(Date.now() - input.confirmedOffense.resetAfterDays * 86_400_000);
        const { rows } = await client.query<{ count: number }>(
          `INSERT INTO moderation_offenses (guild_id, user_id, count, last_at) VALUES ($1, $2, 1, now())
           ON CONFLICT (guild_id, user_id) DO UPDATE
           SET count = CASE WHEN moderation_offenses.last_at < $3 THEN 1 ELSE moderation_offenses.count + 1 END, last_at = now()
           RETURNING count`,
          [input.guildId, input.confirmedOffense.userId, resetAt],
        );
        offenseCount = rows[0]?.count;
      }
      await this.insertAudit(client, {
        guildId: input.guildId, actorId: input.actorId, eventType: "action.finalized",
        targetType: "action_ledger", targetId: input.actionId, detail: { status: input.status, caseId: input.caseId ?? null, offenseCount: offenseCount ?? null },
      });
      await client.query("COMMIT");
      return offenseCount === undefined ? {} : { offenseCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordConfirmedOffense(input: { guildId: string; userId: string; resetAfterDays: number }): Promise<number> {
    await this.ensureSchema();
    const resetAt = new Date(Date.now() - input.resetAfterDays * 86_400_000);
    const { rows } = await pool.query<{ count: number }>(
      `INSERT INTO moderation_offenses (guild_id, user_id, count, last_at) VALUES ($1, $2, 1, now())
       ON CONFLICT (guild_id, user_id) DO UPDATE
       SET count = CASE WHEN moderation_offenses.last_at < $3 THEN 1 ELSE moderation_offenses.count + 1 END,
           last_at = now()
       RETURNING count`,
      [input.guildId, input.userId, resetAt],
    );
    return rows[0]?.count ?? 1;
  }

  private async insertAudit(client: Pick<typeof pool, "query">, input: Omit<ModerationAuditLog, "id" | "createdAt">) {
    await client.query(
      `INSERT INTO moderation_audit_logs (id, guild_id, actor_id, event_type, target_type, target_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [randomUUID(), input.guildId, input.actorId, input.eventType, input.targetType, input.targetId, JSON.stringify(input.detail)],
    );
  }
}

export const moderationStore: ModerationStore = new PostgresModerationStore();