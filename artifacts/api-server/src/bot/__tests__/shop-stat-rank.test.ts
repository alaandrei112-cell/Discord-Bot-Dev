import { describe, it, expect, vi } from "vitest";

// ── Mock discord.js (survival.ts imports EmbedBuilder etc at module level) ────
vi.mock("discord.js", () => {
  class EmbedBuilder {
    data: Record<string, unknown> = {};
    setColor(v: unknown) { this.data.color = v; return this; }
    setTitle(v: unknown) { this.data.title = v; return this; }
    setDescription(v: unknown) { this.data.description = v; return this; }
    setImage(v: unknown) { this.data.image = v; return this; }
    setFooter(v: unknown) { this.data.footer = v; return this; }
    setTimestamp() { return this; }
    setThumbnail(v: unknown) { this.data.thumbnail = v; return this; }
    addFields(...f: unknown[]) { this.data.fields = f; return this; }
  }
  class ActionRowBuilder {
    components: unknown[] = [];
    addComponents(...c: unknown[]) { this.components.push(...c); return this; }
  }
  class ButtonBuilder {
    setCustomId() { return this; }
    setLabel() { return this; }
    setStyle() { return this; }
    setEmoji() { return this; }
    setDisabled() { return this; }
  }
  return {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  };
});

vi.mock("../assets", () => ({
  IMG: { monster: "", death: "", chest: "", shop: "" },
  COMPANION_IMG: {},
  CHEST_IMG: {},
  KEY_IMG: {},
  EQUIPMENT_IMG: {},
  MONSTER_IMG: Array(14).fill(""),
  monsterImg: () => "",
  bossImg: () => "",
}));

vi.mock("../combat-events", () => ({
  getActiveBattleEvent: vi.fn(() => null),
  consumeStormDrain: vi.fn(() => 0),
}));

vi.mock("../status-effects", () => ({
  getCombatModifiers: vi.fn(() => ({ critAdd: 0, damageMult: 1, damageTakenMult: 1 })),
  formatActiveEffects: vi.fn(() => null),
  formatCombatEffects: vi.fn(() => ""),
  getRewardMultipliers: vi.fn(() => ({ xpMult: 1, goldMult: 1 })),
}));

// Import after mocks
import { statRankInfo, STAT_BAR_MAX, STAT_RANK_MAX } from "../survival";

describe("statRankInfo — visual rank system (nothing is ever reset)", () => {
  it("rank 0 with partial progress before the first max", () => {
    expect(statRankInfo(0)).toEqual({ rank: 0, inRank: 0 });
    expect(statRankInfo(7)).toEqual({ rank: 0, inRank: 7 });
    expect(statRankInfo(19)).toEqual({ rank: 0, inRank: 19 });
  });

  it("hitting max level rolls into the next rank with an empty bar", () => {
    expect(statRankInfo(20)).toEqual({ rank: 1, inRank: 0 });
    expect(statRankInfo(21)).toEqual({ rank: 1, inRank: 1 });
    expect(statRankInfo(39)).toEqual({ rank: 1, inRank: 19 });
    expect(statRankInfo(40)).toEqual({ rank: 2, inRank: 0 });
  });

  it("rank keeps growing every STAT_BAR_MAX purchases", () => {
    expect(statRankInfo(STAT_BAR_MAX * 50 + 5)).toEqual({ rank: 50, inRank: 5 });
    expect(statRankInfo(STAT_BAR_MAX * 99 + 19)).toEqual({ rank: 99, inRank: 19 });
  });

  it("caps at rank 100 with a permanently full bar", () => {
    expect(statRankInfo(STAT_BAR_MAX * STAT_RANK_MAX)).toEqual({ rank: 100, inRank: STAT_BAR_MAX });
    expect(statRankInfo(STAT_BAR_MAX * STAT_RANK_MAX + 123)).toEqual({ rank: 100, inRank: STAT_BAR_MAX });
  });
});
