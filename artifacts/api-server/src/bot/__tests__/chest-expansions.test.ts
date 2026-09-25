import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("discord.js", () => {
  class EmbedBuilder {
    setColor() { return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    setImage() { return this; }
    setFooter() { return this; }
  }
  class ActionRowBuilder {
    addComponents() { return this; }
  }
  class ButtonBuilder {
    setCustomId() { return this; }
    setLabel() { return this; }
    setEmoji() { return this; }
    setStyle() { return this; }
    setDisabled() { return this; }
  }
  class TextChannel {}
  return {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    TextChannel,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
  };
});

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({
  pool: { query },
}));

vi.mock("../db", () => ({
  addPlayerGold: vi.fn(),
  addPlayerItem: vi.fn(),
  addPlayerKey: vi.fn(),
  addPlayerXp: vi.fn(),
  consumePlayerItems: vi.fn(),
  ensureBotStateTable: vi.fn(),
  getGuildPlayers: vi.fn(),
  getPlayerItems: vi.fn(),
  tryDeductPlayerGold: vi.fn(),
}));

vi.mock("../survival", () => ({
  BRAND_FOOTER: "footer",
  ITEMS: {
    fragment_luna_stinsa: { label: "Fragment de Lună Stinsă" },
    fragment_ochiul_cenușii: { label: "Fragment de Ochi al Cenușii" },
  },
}));

vi.mock("../channel-config", () => ({
  getChannel: vi.fn(() => null),
}));

import {
  claimPersonalChest,
  claimSeasonalChest,
  claimHiddenChest,
  buildSeasonalChestEmbed,
  buildHiddenChestEmbed,
  personalChestReward,
  personalChestScore,
  personalChestTier,
  SEASONAL_CHEST_COOLDOWN_MS,
  SEASONAL_CHEST_MESSAGE_RETENTION_MS,
  HIDDEN_CHEST_MESSAGE_RETENTION_MS,
  isSeasonalChestOnCooldown,
  seasonalForBucket,
} from "../chest-expansions";

describe("chest expansion pure mechanics", () => {
  it("converts daily activity into capped score and five reward tiers", () => {
    expect(personalChestScore({
      date: "2026-09-01",
      messages: 25,
      kills: 10,
      bosses: 2,
      quests: 2,
      keys: 2,
      claimed: false,
    })).toBe(24);
    expect(personalChestTier({
      date: "2026-09-01",
      messages: 25,
      kills: 10,
      bosses: 2,
      quests: 2,
      keys: 2,
      claimed: false,
    })).toBe(5);
    expect(personalChestReward({
      date: "2026-09-01",
      messages: 0,
      kills: 0,
      bosses: 0,
      quests: 0,
      keys: 0,
      claimed: false,
    })).toMatchObject({ tier: 1, gold: 170, xp: 105 });
  });

  it("rotates through all seasonal chest variants", () => {
    const seasons = [0, 1, 2, 3].map((bucket) => seasonalForBucket(bucket).season);
    expect(new Set(seasons).size).toBe(4);
    expect(seasonalForBucket(4).season).toBe(seasons[0]);
  });

  it("keeps the completed seasonal message for twenty minutes", () => {
    expect(SEASONAL_CHEST_MESSAGE_RETENTION_MS).toBe(20 * 60 * 1000);
    expect(HIDDEN_CHEST_MESSAGE_RETENTION_MS).toBe(20 * 60 * 1000);
  });

  it("keeps seasonal chests on cooldown for two hours after spawning", () => {
    const openedAt = 1_000_000;
    expect(SEASONAL_CHEST_COOLDOWN_MS).toBe(2 * 60 * 60 * 1000);
    expect(isSeasonalChestOnCooldown({ openedAt }, openedAt + SEASONAL_CHEST_COOLDOWN_MS - 1)).toBe(true);
    expect(isSeasonalChestOnCooldown({ openedAt }, openedAt + SEASONAL_CHEST_COOLDOWN_MS)).toBe(false);
  });

  it("stores the public claimant for seasonal and hidden chests", async () => {
    const seasonal = {
      id: "seasonal_1",
      claimed: true,
      claimedBy: { userId: "user-1", username: "Mara" },
    };
    const hidden = {
      id: "oracle_1",
      claimed: true,
      claimedBy: { userId: "user-2", username: "Doru" },
    };
    query
      .mockResolvedValueOnce({ rows: [{ value: JSON.stringify(seasonal) }] })
      .mockResolvedValueOnce({ rows: [{ value: JSON.stringify(hidden) }] });

    const claimedSeasonal = await claimSeasonalChest("guild-1", "seasonal_1", "user-1", "Mara");
    const claimedHidden = await claimHiddenChest("guild-1", "oracle_1", "user-2", "Doru");

    expect(claimedSeasonal?.claimedBy?.username).toBe("Mara");
    expect(claimedHidden?.claimedBy?.username).toBe("Doru");
    expect(query.mock.calls[0]?.[0]).toContain("claimedBy");
    expect(query.mock.calls[1]?.[0]).toContain("claimedBy");
    expect(query.mock.calls[0]?.[1]).toContain("Mara");
    expect(query.mock.calls[1]?.[1]).toContain("Doru");
    expect(query.mock.calls[1]?.[0]).toContain("cleanupAt");
    expect(query.mock.calls[1]?.[1]).toHaveLength(5);
  });
});

describe("personal chest claim", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("allows only one winner when two claims race", async () => {
    const activity = {
      date: "2026-09-01",
      messages: 10,
      kills: 2,
      bosses: 0,
      quests: 0,
      keys: 0,
      claimed: false,
    };
    query
      .mockResolvedValueOnce({ rows: [{ value: JSON.stringify({ ...activity, claimed: true }) }] })
      .mockResolvedValueOnce({ rows: [] });

    const results = await Promise.all([
      claimPersonalChest("user-1", "guild-1"),
      claimPersonalChest("user-1", "guild-1"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});