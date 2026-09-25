import { EventEmitter } from "node:events";
import { Events, type Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { defaultModerationConfig, type ModerationConfig } from "../../../moderation/config";
import { attachModerationEvents, type ModerationEventHelpers } from "../events";

const waitForHandlers = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const roles = {
  some: () => false,
  has: () => false,
  filter: () => ({ map: () => [] }),
};

function guild(id: string) {
  return {
    id,
    channels: { cache: new Map() },
    members: { fetch: vi.fn() },
    fetchAuditLogs: vi.fn(async () => ({ entries: new Map() })),
  };
}

function member(theGuild: ReturnType<typeof guild>, id: string, createdTimestamp = 0) {
  return {
    id,
    guild: theGuild,
    user: { id, bot: false, createdTimestamp },
    roles: { cache: roles },
    nickname: null,
  };
}

function message(theGuild: ReturnType<typeof guild>, authorId = "22222") {
  return {
    id: `message-${authorId}`,
    guild: theGuild,
    guildId: theGuild.id,
    channelId: "33333",
    author: { id: authorId, bot: false },
    member: { user: { bot: false }, roles: { cache: roles } },
    content: "changed",
    partial: false,
    delete: vi.fn(async () => undefined),
  };
}

function setup(config: ModerationConfig) {
  const emitter = new EventEmitter();
  const client = Object.assign(emitter, { user: { id: "99999", bot: true } }) as unknown as Client;
  const helpers: ModerationEventHelpers = {
    getConfig: vi.fn(async () => config),
    executeModerationAction: vi.fn(async () => ({})),
    handleMessage: vi.fn(async () => false),
    notify: vi.fn(async () => undefined),
    auditExternal: vi.fn(async () => undefined),
  };
  attachModerationEvents(client, helpers);
  return { client, emitter, helpers };
}

describe("non-message moderation events", () => {
  it("does not notify or enforce when defaults are disabled", async () => {
    const config = structuredClone(defaultModerationConfig);
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10000");
    const joined = member(targetGuild, "20000", 0);
    const edited = message(targetGuild);

    emitter.emit(Events.GuildMemberAdd, joined);
    emitter.emit(Events.MessageUpdate, { content: "before" }, edited);
    await waitForHandlers();

    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    expect(helpers.notify).not.toHaveBeenCalled();
    // Re-running content checks is harmless with defaults off, and prevents an
    // edit from bypassing a subsequently enabled content rule.
    expect(helpers.handleMessage).toHaveBeenCalledWith(client, edited);
  });

  it("rechecks edited content and applies the configured edit-spam action", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "mute", severity: "normal", thresholds: { limit: 1, window: 60 } };
    const { client, emitter, helpers } = setup(config);
    const targetGuild = guild("10001");
    const first = message(targetGuild, "20001");
    const second = message(targetGuild, "20001");
    const third = message(targetGuild, "20001");

    emitter.emit(Events.MessageUpdate, { content: "first" }, first);
    emitter.emit(Events.MessageUpdate, { content: "second" }, second);
    emitter.emit(Events.MessageUpdate, { content: "third" }, third);
    await waitForHandlers();

    expect(helpers.handleMessage).toHaveBeenCalledTimes(3);
    expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10001", targetId: "20001", type: "mute", source: "automod",
      idempotencyKey: expect.stringMatching(/^edit:10001:20001:/),
    }));
  });

  it("routes configured edit deletion through the moderation action ledger", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.edit = { enabled: true, action: "delete", severity: "normal", thresholds: { limit: 1, window: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10007");
    const first = message(targetGuild, "20007");
    const second = message(targetGuild, "20007");

    emitter.emit(Events.MessageUpdate, { content: "first" }, first);
    emitter.emit(Events.MessageUpdate, { content: "second" }, second);
    await waitForHandlers();

    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "10007", type: "delete", messageId: second.id, channelId: "33333",
      source: "automod", idempotencyKey: expect.stringMatching(/^edit:10007:20007:/),
    }));
    expect(first.delete).not.toHaveBeenCalled();
    expect(second.delete).not.toHaveBeenCalled();
  });

  it("routes a rapid-join raid alert to antiRaid.alertChannelId", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.alertChannelId = "44444";
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10002");

    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20002"));
    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20003"));
    await waitForHandlers();

    expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Alertă anti-raid", expect.any(String), "44444");
    expect(helpers.executeModerationAction).toHaveBeenCalledWith(expect.objectContaining({
      targetId: "20003", type: "warn", source: "raid",
    }));
  });

  it("catches handler and enforcement failures instead of leaking rejected listeners", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10003");
    (helpers.executeModerationAction as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("hierarchy"));

    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20004"));
    emitter.emit(Events.GuildMemberAdd, member(targetGuild, "20005"));
    await expect(waitForHandlers()).resolves.toBeUndefined();
  });

  it("never punishes a message author or changed-role target when the audit actor is unverified", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiSpam.enabled = true;
    config.antiSpam.delete = { enabled: true, action: "ban", severity: "normal", thresholds: { limit: 1, window: 60 } };
    config.suspiciousBehavior.enabled = true;
    config.suspiciousBehavior.alertChannelId = "44445";
    config.suspiciousBehavior.roleChanges = { enabled: true, action: "kick", severity: "normal", thresholds: { limit: 1 } };
    const { emitter, helpers } = setup(config);
    const targetGuild = guild("10004");

    emitter.emit(Events.MessageDelete, message(targetGuild, "author-id"));
    emitter.emit(Events.MessageDelete, message(targetGuild, "author-id"));
    const oldMember = member(targetGuild, "role-target");
    const changedRoles = {
      some: () => false,
      has: () => false,
      filter: (predicate: (role: { id: string }) => boolean) => ({
        map: (mapper: (role: { id: string }) => string) => [{ id: "55555" }].filter(predicate).map(mapper),
      }),
    };
    const changedMember = { ...member(targetGuild, "role-target"), roles: { cache: changedRoles } };
    emitter.emit(Events.GuildMemberUpdate, oldMember, changedMember);
    emitter.emit(Events.GuildMemberUpdate, oldMember, changedMember);
    await waitForHandlers();

    expect(helpers.executeModerationAction).not.toHaveBeenCalled();
    expect(helpers.notify).toHaveBeenCalledWith(config, targetGuild, "Activitate suspectă", expect.stringContaining("Actor neverificat"), "44445");
  });

  it("keeps rate state isolated between guilds", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.antiRaid.enabled = true;
    config.antiRaid.rule = { enabled: true, action: "warn", severity: "normal", thresholds: { joins: 1, windowSeconds: 60 } };
    const { emitter, helpers } = setup(config);
    const firstGuild = guild("10005");
    const secondGuild = guild("10006");

    emitter.emit(Events.GuildMemberAdd, member(firstGuild, "21001"));
    emitter.emit(Events.GuildMemberAdd, member(secondGuild, "22001"));
    await waitForHandlers();
    expect(helpers.executeModerationAction).not.toHaveBeenCalled();

    emitter.emit(Events.GuildMemberAdd, member(firstGuild, "21002"));
    await waitForHandlers();
    expect(helpers.executeModerationAction).toHaveBeenCalledTimes(1);
    expect(helpers.executeModerationAction).toHaveBeenLastCalledWith(expect.objectContaining({ guildId: "10005" }));
  });
});