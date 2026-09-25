import { describe, expect, it, vi } from "vitest";
import {
  fetchDiscordGuildStats,
  fetchDiscordGuildStatsViaRest,
} from "../discord-stats";

describe("fetchDiscordGuildStats", () => {
  it("forces a fresh Discord guild fetch so cached guilds still expose member counts", async () => {
    const fetch = vi.fn().mockResolvedValue({
      approximatePresenceCount: 7,
      approximateMemberCount: 42,
    });

    const stats = await fetchDiscordGuildStats(
      { guilds: { fetch } },
      "guild-123",
    );

    expect(fetch).toHaveBeenCalledWith({
      guild: "guild-123",
      withCounts: true,
      force: true,
    });
    expect(stats).toEqual({ onlineCount: 7, totalMembers: 42 });
  });

  it("falls back to the regular member count when Discord omits the approximate count", async () => {
    const stats = await fetchDiscordGuildStats(
      {
        guilds: {
          fetch: vi.fn().mockResolvedValue({
            approximatePresenceCount: null,
            approximateMemberCount: null,
            memberCount: 42,
          }),
        },
      },
      "guild-123",
    );

    expect(stats).toEqual({ onlineCount: null, totalMembers: 42 });
  });

  it("reads counts through Discord REST when the development gateway is disabled", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          approximate_presence_count: 5,
          approximate_member_count: 37,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      fetchDiscordGuildStatsViaRest("test-token", "guild/123"),
    ).resolves.toEqual({ onlineCount: 5, totalMembers: 37 });
    expect(fetch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/guild%2F123?with_counts=true",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bot test-token",
        },
      },
    );
    vi.unstubAllGlobals();
  });
});