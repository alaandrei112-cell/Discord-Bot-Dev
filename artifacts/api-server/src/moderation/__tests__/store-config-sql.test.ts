import { pool } from "@workspace/db";
import { describe, expect, it, vi } from "vitest";
import { defaultModerationConfig } from "../config";
import { ModerationRevisionConflictError } from "../errors";
import { PostgresModerationStore } from "../store";

describe.skipIf(!process.env.DATABASE_URL)("moderation config PostgreSQL compare-and-swap", () => {
  it("inserts once, updates existing revisions, rejects stale writes, and runs retention after commit", async () => {
    // TEMP tables shadow the real tables only on this connection; no application
    // records are read or modified, and the SQL runs on PostgreSQL (not a mock).
    const connect = pool.connect.bind(pool);
    const client = await connect();
    const store = new PostgresModerationStore();
    const originalRelease = client.release.bind(client);
    const connectSpy = vi.spyOn(pool, "connect").mockImplementation(async () => ({
      query: client.query.bind(client),
      release: () => {},
    }) as never);
    const schemaSpy = vi.spyOn(store, "ensureSchema").mockResolvedValue();
    const pruneSpy = vi.spyOn(store, "pruneCases").mockResolvedValue(0);
    try {
      await client.query(`CREATE TEMP TABLE moderation_configs (
        guild_id text PRIMARY KEY, config jsonb NOT NULL, version integer NOT NULL,
        updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(`CREATE TEMP TABLE moderation_audit_logs (
        id uuid PRIMARY KEY, guild_id text, actor_id text, event_type text,
        target_type text, target_id text, detail jsonb, created_at timestamptz DEFAULT now()
      )`);
      const guildId = "123456789012345678";
      const first = structuredClone(defaultModerationConfig);
      first.embeds.titleTemplate = "First saved title";
      expect((await store.putConfig(guildId, first, "actor", 0)).version).toBe(1);

      const second = structuredClone(first);
      second.embeds.titleTemplate = "Second saved title";
      expect((await store.putConfig(guildId, second, "actor", 1)).version).toBe(2);
      expect(pruneSpy).toHaveBeenCalledTimes(2);
      expect(pruneSpy).toHaveBeenLastCalledWith(guildId, second.cases.retentionDays);
      await expect(store.putConfig(guildId, first, "actor", 1)).rejects.toBeInstanceOf(ModerationRevisionConflictError);
      await expect(store.putConfig("987654321098765432", first, "actor", 5)).rejects.toBeInstanceOf(ModerationRevisionConflictError);
      await expect(store.putConfig(guildId, first, "actor", 0)).rejects.toBeInstanceOf(ModerationRevisionConflictError);
      expect(pruneSpy).toHaveBeenCalledTimes(2);

      pruneSpy.mockRejectedValueOnce(new Error("retention unavailable"));
      const saved = await store.putConfig(guildId, second, "actor", 2);
      expect(saved.version).toBe(3);
      expect(pruneSpy).toHaveBeenCalledTimes(3);
      pruneSpy.mockRejectedValueOnce(new Error("retention unavailable"));
      const toggled = await store.putProtectionToggle(guildId, "protection", false, "actor");
      expect(toggled.version).toBe(4);
      expect(toggled.config.protection.enabled).toBe(false);
      expect(pruneSpy).toHaveBeenCalledTimes(4);
      expect(pruneSpy).toHaveBeenLastCalledWith(guildId, second.cases.retentionDays);

      const { rows } = await client.query<{ config: typeof second; version: number }>(
        "SELECT config, version FROM moderation_configs WHERE guild_id = $1", [guildId],
      );
      expect(rows[0]).toMatchObject({ version: 4, config: { embeds: { titleTemplate: "Second saved title" }, protection: { enabled: false } } });
      const audit = await client.query("SELECT id FROM moderation_audit_logs");
      expect(audit.rowCount).toBe(4);
    } finally {
      connectSpy.mockRestore();
      schemaSpy.mockRestore();
      pruneSpy.mockRestore();
      // Destroy the test connection rather than returning its TEMP tables to
      // the shared pool (which could otherwise leak them into later tests).
      originalRelease(true);
    }
  });
});