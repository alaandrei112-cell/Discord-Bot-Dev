import { describe, expect, it, vi } from "vitest";
import type { Guild } from "discord.js";
import { defaultModerationConfig } from "../../../moderation/config";
import { notify } from "../engine";

describe("saved moderation notification settings", () => {
  const guildId = "123456789012345678";
  function fixture(destinationGuildId = guildId) {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const channel = { guildId: destinationGuildId, isTextBased: () => true, send };
    const fetch = vi.fn(async () => channel);
    const guild = { id: guildId, channels: { cache: new Map(), fetch } } as unknown as Guild;
    return { guild, send, fetch };
  }

  it("uses the configured GIF animation, icon, text templates and color", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.embeds.enabled = true;
    config.embeds.animations = true;
    config.embeds.animationUrl = "https://example.test/animation.gif";
    config.embeds.iconUrl = "https://example.test/icon.png";
    config.embeds.color = "#112233";
    config.embeds.titleTemplate = "{action} / {action}";
    config.embeds.descriptionTemplate = "{reason} — {reason}";
    const { guild, send } = fixture();

    await notify(config, guild, "AI", "Încălcare", "987654321098765432");
    const payload = send.mock.calls[0]?.[0] as unknown as { embeds: Array<{ toJSON(): {
      title: string; description: string; color: number; image?: { url: string }; thumbnail?: { url: string }
    } }> };
    const embed = payload.embeds[0]!.toJSON();
    expect(embed).toMatchObject({
      title: "AI / AI", description: "Încălcare — Încălcare", color: 0x112233,
      image: { url: config.embeds.animationUrl },
      thumbnail: { url: config.embeds.iconUrl },
    });
  });

  it("uses the audit channel for an unset module destination only while audit is enabled", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.audit.channelId = "987654321098765432";
    const { guild, fetch, send } = fixture();
    await notify(config, guild, "AI", "Flag", config.ai.logChannelId);
    expect(fetch).not.toHaveBeenCalled();
    config.audit.enabled = true;
    await notify(config, guild, "AI", "Flag", config.ai.logChannelId);
    expect(fetch).toHaveBeenCalledWith(config.audit.channelId);
    expect(send).toHaveBeenCalledTimes(1);
    config.audit.enabled = false;
    await notify(config, guild, "Anti-raid", "Flag", null);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit module alert channel over audit fallback", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.audit.enabled = true;
    config.audit.channelId = "987654321098765432";
    const { guild, fetch } = fixture();
    await notify(config, guild, "AI", "Flag", "876543210987654321");
    expect(fetch).toHaveBeenCalledWith("876543210987654321");
  });

  it("never sends a configured notification into another guild", async () => {
    const config = structuredClone(defaultModerationConfig);
    const { guild, send } = fixture("another-guild");
    await notify(config, guild, "AI", "Flag", "987654321098765432");
    expect(send).not.toHaveBeenCalled();
  });
});