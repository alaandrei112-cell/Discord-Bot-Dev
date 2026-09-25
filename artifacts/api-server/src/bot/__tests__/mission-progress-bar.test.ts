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

// ── Mock side-effect modules that survival.ts imports ─────────────────────────
vi.mock("../assets", () => ({
  IMG: { monster: "", death: "", chest: "" },
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
import { buildProgressBar, buildMissionEmbed, DAILY_QUESTS } from "../survival";

const FULL = "🟦";
const EMPTY = "⬛";

function segments(bar: string): string[] {
  return Array.from(bar);
}

describe("buildProgressBar", () => {
  it("renders a fully empty bar at 0 progress", () => {
    const bar = buildProgressBar(0, 10, 10);
    expect(bar).toBe(EMPTY.repeat(10));
    expect(bar).not.toContain(FULL);
  });

  it("shows at least one filled segment for small progress > 0", () => {
    const bar = buildProgressBar(1, 100, 10);
    const segs = segments(bar);
    expect(segs).toHaveLength(10);
    expect(segs[0]).toBe(FULL);
    expect(bar).toBe(FULL + EMPTY.repeat(9));
  });

  it("shows one filled segment at 1/10 progress", () => {
    const bar = buildProgressBar(1, 10, 10);
    expect(bar).toBe(FULL + EMPTY.repeat(9));
  });

  it("renders a completely full bar at full progress", () => {
    const bar = buildProgressBar(10, 10, 10);
    expect(bar).toBe(FULL.repeat(10));
    expect(bar).not.toContain(EMPTY);
  });

  it("clamps overflow progress to a full bar", () => {
    const bar = buildProgressBar(15, 10, 10);
    expect(bar).toBe(FULL.repeat(10));
  });

  it("clamps negative progress to an empty bar", () => {
    const bar = buildProgressBar(-3, 10, 10);
    expect(bar).toBe(EMPTY.repeat(10));
  });

  it("renders an empty bar when target is 0", () => {
    const bar = buildProgressBar(0, 0, 10);
    expect(bar).toBe(EMPTY.repeat(10));
  });

  it("always renders exactly `width` segments", () => {
    for (const cur of [0, 1, 3, 5, 9, 10]) {
      expect(segments(buildProgressBar(cur, 10, 10))).toHaveLength(10);
    }
  });
});

describe("buildMissionEmbed progress bar", () => {
  const TODAY = "2026-07-19";

  function embedDescription(progress: number, completed = false): string {
    const embed = buildMissionEmbed(
      { kill_10: { progress, completed, rewardGiven: false, questDate: TODAY } },
      TODAY,
    );
    return (embed as unknown as { data: { description: string } }).data.description;
  }

  it("shows a fully empty bar at 0 progress", () => {
    const desc = embedDescription(0);
    expect(desc).toContain(EMPTY.repeat(10));
    expect(desc).toContain("**0/10**");
  });

  it("shows at least one filled segment at 1/10 progress", () => {
    const desc = embedDescription(1);
    expect(desc).toContain(FULL + EMPTY.repeat(9));
    expect(desc).toContain("**1/10**");
  });

  it("resets the bar to empty when the quest date is stale", () => {
    const embed = buildMissionEmbed(
      { kill_10: { progress: 7, completed: false, rewardGiven: false, questDate: "2026-07-18" } },
      TODAY,
    );
    const desc = (embed as unknown as { data: { description: string } }).data.description;
    expect(desc).toContain("**0/10**");
    expect(desc).not.toContain("**7/10**");
  });

  it("shows the completed status instead of a bar when done", () => {
    const desc = embedDescription(DAILY_QUESTS.kill_10.target, true);
    expect(desc).toContain("Completată");
  });

  it("lists every daily quest even with no progress rows", () => {
    const embed = buildMissionEmbed({}, TODAY);
    const desc = (embed as unknown as { data: { description: string } }).data.description;
    for (const key of Object.keys(DAILY_QUESTS) as (keyof typeof DAILY_QUESTS)[]) {
      expect(desc).toContain(DAILY_QUESTS[key].label);
      expect(desc).toContain(`**0/${DAILY_QUESTS[key].target}**`);
    }
  });
});
