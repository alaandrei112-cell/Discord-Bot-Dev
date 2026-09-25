export interface DiscordGuildCountSource {
  guilds: {
    fetch(options: {
      guild: string;
      withCounts: boolean;
      force: boolean;
    }): Promise<{
      approximatePresenceCount?: number | null;
      approximateMemberCount?: number | null;
      memberCount?: number | null;
    }>;
  };
}

export async function fetchDiscordGuildStats(
  client: DiscordGuildCountSource,
  guildId: string,
): Promise<{ onlineCount: number | null; totalMembers: number | null }> {
  // Discord.js otherwise returns the cached Guild object, which is populated
  // from the gateway and does not contain the REST approximate counts.
  const guild = await client.guilds.fetch({
    guild: guildId,
    withCounts: true,
    force: true,
  });

  return {
    onlineCount: guild.approximatePresenceCount ?? null,
    totalMembers: guild.approximateMemberCount ?? guild.memberCount ?? null,
  };
}

export async function fetchDiscordGuildStatsViaRest(
  token: string | undefined,
  guildId: string,
): Promise<{ onlineCount: number | null; totalMembers: number | null }> {
  if (!token) throw new Error("DISCORD_TOKEN is not configured");

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}?with_counts=true`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bot ${token}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Discord guild stats request failed (${response.status})`);
  }

  const data = await response.json() as {
    approximate_presence_count?: unknown;
    approximate_member_count?: unknown;
  };
  const asCount = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    onlineCount: asCount(data.approximate_presence_count),
    totalMembers: asCount(data.approximate_member_count),
  };
}