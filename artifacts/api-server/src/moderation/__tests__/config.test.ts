import { describe, expect, it } from "vitest";
import { defaultModerationConfig, ModerationConfigSchema } from "../config";

describe("moderation configuration defaults", () => {
  it("ships with every enforcement module disabled", () => {
    expect(defaultModerationConfig.protection.enabled).toBe(true);
    expect(defaultModerationConfig.autoMod.enabled).toBe(false);
    expect(defaultModerationConfig.autoMod.scamFilter).toEqual({ enabled: false, action: "delete" });
    expect(defaultModerationConfig.autoMod.scamPhrases).toEqual([]);
    expect(defaultModerationConfig.antiRaid.enabled).toBe(false);
    expect(defaultModerationConfig.antiSpam.enabled).toBe(false);
    expect(defaultModerationConfig.antiFlood.enabled).toBe(false);
    expect(defaultModerationConfig.manualTools.enabled).toBe(false);
    expect(defaultModerationConfig.suspiciousBehavior.enabled).toBe(false);
    expect(defaultModerationConfig.ai.enabled).toBe(false);
    expect(defaultModerationConfig.escalation.enabled).toBe(false);
    expect(defaultModerationConfig.embeds.enabled).toBe(false);
  });

  it("preserves an explicitly disabled protection category", () => {
    const config = ModerationConfigSchema.parse({ protection: { enabled: false } });
    expect(config.protection.enabled).toBe(false);
  });

  it("keeps automatic activity logs disabled by default and requires private-channel access when enabled", () => {
    expect(defaultModerationConfig.activityLog.enabled).toBe(false);
    expect(defaultModerationConfig.activityLog.channelIds.messages).toBeNull();
    expect(() => ModerationConfigSchema.parse({
      activityLog: { enabled: true, roleIds: [] },
    })).toThrow(/cel puțin un rol/i);
    expect(() => ModerationConfigSchema.parse({
      activityLog: { enabled: true, roleIds: ["123456789012345678"], categories: { messages: false, members: false, channels: false, roles: false, voice: false, moderation: false, security: false } },
    })).toThrow(/cel puțin o categorie/i);
  });

  it("retains a disabled rule unless an operator explicitly enables it", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: { wordFilter: { action: "mute", thresholds: { matches: 2 } } },
    });
    expect(config.autoMod.wordFilter.enabled).toBe(false);
    expect(config.autoMod.wordFilter.action).toBe("mute");
    expect(config.autoMod.wordFilter.thresholds.matches).toBe(2);
  });

  it("accepts only the requested anti-scam actions and persists custom phrases", () => {
    const config = ModerationConfigSchema.parse({
      autoMod: {
        scamFilter: { enabled: true, action: "kick" },
        scamPhrases: ["claim bonus", "ai câștigat bani"],
      },
    });
    expect(config.autoMod.scamFilter).toEqual({ enabled: true, action: "kick" });
    expect(config.autoMod.scamPhrases).toEqual(["claim bonus", "ai câștigat bani"]);
    expect(() => ModerationConfigSchema.parse({
      autoMod: { scamFilter: { action: "ban" } },
    })).toThrow();
  });

  it("fills missing rule thresholds without replacing saved values or enabling rules", () => {
    const defaults = defaultModerationConfig;
    expect(defaults.autoMod.emojiLimit.thresholds.emoji).toBe(10);
    expect(defaults.autoMod.capsLimit.thresholds.capsPercent).toBe(75);
    expect(defaults.antiRaid.rule.thresholds.joins).toBe(10);
    expect(defaults.antiRaid.rule.thresholds.windowSeconds).toBe(60);
    expect(defaults.antiSpam.message.thresholds.messages).toBe(5);
    expect(defaults.antiSpam.message.thresholds.windowMs).toBe(5);
    expect(defaults.antiSpam.edit.thresholds.limit).toBe(5);
    expect(defaults.antiFlood.longMessage.thresholds.length).toBe(1_500);
    expect(defaults.suspiciousBehavior.joinLeaveFlood.thresholds.limit).toBe(10);
    expect(defaults.antiSpam.message.enabled).toBe(false);

    const config = ModerationConfigSchema.parse({
      antiSpam: {
        message: { thresholds: { limit: 12, window: 8 } },
      },
    });
    expect(config.antiSpam.message.thresholds.limit).toBe(12);
    expect(config.antiSpam.message.thresholds.window).toBe(8);
    expect(config.antiSpam.message.thresholds.messages).toBeUndefined();
    expect(config.antiSpam.message.thresholds.windowMs).toBeUndefined();
    expect(config.antiSpam.message.enabled).toBe(false);
  });

  it("rejects values outside Discord and moderation bounds", () => {
    expect(() => ModerationConfigSchema.parse({
      antiRaid: { alertChannelId: "not-a-snowflake" },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      embeds: { color: "red" },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      antiSpam: { message: { thresholds: { windowMs: 0 } } },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      multiServer: { isolatedData: false },
    })).toThrow();
    expect(() => ModerationConfigSchema.parse({
      timeProfiles: { timezone: "not/a-timezone" },
    })).toThrow();
  });
});