import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { deliverActivityLog } from "../events";

const eventRoutes = [
  ["discord.message_update", "messages"],
  ["discord.member_join", "members"],
  ["discord.channelCreate", "channels"],
  ["discord.guildRoleUpdate", "roles"],
  ["discord.voice_state_update", "voice"],
  ["action.applied", "moderation"],
  ["raid.detected", "security"],
] as const;

function testGuild() {
  const channels = new Map<string, { guildId: string; isTextBased: () => boolean; send: ReturnType<typeof vi.fn> }>();
  const sends = new Map<string, ReturnType<typeof vi.fn>>();
  for (const [, category] of eventRoutes) {
    const send = vi.fn(async () => undefined);
    const channelId = `log-${category}`;
    sends.set(category, send);
    channels.set(channelId, { guildId: "123456789012345678", isTextBased: () => true, send });
  }
  const guild = {
    id: "123456789012345678",
    channels: {
      cache: channels,
      fetch: vi.fn(async (id: string) => channels.get(id) ?? null),
    },
  } as unknown as Guild;
  return { guild, sends, channels };
}

describe("automatic Discord activity-log delivery", () => {
  it("routes every configured event family and does not include message contents", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.roleIds = ["234567890123456789"];
    for (const [, category] of eventRoutes) {
      config.activityLog.categories[category] = true;
      config.activityLog.channelIds[category] = `log-${category}`;
    }
    const { guild, sends } = testGuild();

    for (const [eventType, category] of eventRoutes) {
      await deliverActivityLog(guild, config, eventType, "target", "345678901234567890", {
        actorVerified: false,
        actorId: null,
        channelId: "456789012345678901",
        contentChanged: true,
        messageContent: "private message body",
      });
      expect(sends.get(category)).toHaveBeenCalledTimes(1);
      const payload = sends.get(category)!.mock.calls[0]![0] as {
        embeds: Array<{ toJSON: () => { fields: Array<{ name: string; value: string }> } }>;
      };
      const fields = payload.embeds[0]!.toJSON().fields;
      expect(fields.find((field) => field.name === "Actor")?.value).toBe("Neverificat de Discord");
      expect(fields.find((field) => field.name === "Țintă")?.value).toContain("345678901234567890");
      expect(JSON.stringify(payload)).not.toContain("private message body");
    }
  });

  it("does not send when the global switch or selected category is off", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.channelIds.messages = "log-messages";
    config.activityLog.categories.messages = false;
    const { guild, sends } = testGuild();

    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});
    config.activityLog.categories.messages = true;
    config.activityLog.enabled = false;
    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});

    expect(sends.get("messages")).not.toHaveBeenCalled();
  });

  it("does not post a guild's log to a channel from another server", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.categories.messages = true;
    config.activityLog.channelIds.messages = "log-messages";
    const { guild, sends, channels } = testGuild();
    channels.get("log-messages")!.guildId = "another-guild";
    await deliverActivityLog(guild, config, "discord.message_update", "message", "1", {});
    expect(sends.get("messages")).not.toHaveBeenCalled();
  });
});