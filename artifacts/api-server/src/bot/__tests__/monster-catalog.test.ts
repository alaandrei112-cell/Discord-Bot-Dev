import { describe, it, expect, vi } from "vitest";

vi.mock("discord.js", () => ({
  EmbedBuilder: class { setColor(){return this;} setTitle(){return this;} setDescription(){return this;} setImage(){return this;} setFooter(){return this;} setThumbnail(){return this;} },
  ActionRowBuilder: class { addComponents(){return this;} },
  ButtonBuilder: class { setCustomId(){return this;} setLabel(){return this;} setEmoji(){return this;} setStyle(){return this;} setDisabled(){return this;} },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
}));
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
vi.mock("../combat-events", () => ({ getActiveBattleEvent: () => null, consumeStormDrain: () => 0 }));
vi.mock("../status-effects", () => ({ getCombatModifiers: () => ({}), formatActiveEffects: () => "", formatCombatEffects: () => "" }));

import { MONSTERS, BOSSES, monsterIndex, bossIndex, bossRank, monsterName, monsterDesc } from "../survival";

describe("monster catalog", () => {
  it("has 14 monsters with names and descriptions", () => {
    expect(MONSTERS).toHaveLength(14);
    for (const m of MONSTERS) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(0);
    }
  });

  it("monsterIndex is deterministic and cycles through all 14 monsters", () => {
    const seen = new Set<number>();
    for (let lvl = 1; lvl <= 14; lvl++) {
      const idx = monsterIndex(lvl);
      expect(idx).toBe(monsterIndex(lvl));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(14);
      seen.add(idx);
    }
    expect(seen.size).toBe(14);
  });

  it("monsterName uses catalog for normal levels and boss names for mini-boss levels", () => {
    expect(MONSTERS.map((m) => m.name)).toContain(monsterName(3));
    expect(BOSSES.map((b) => b.name)).toContain(monsterName(10));
    expect(monsterDesc(3)).toBe(MONSTERS[monsterIndex(3)]!.desc);
  });

  it("has 10 named bosses and monsterName honors a boss rarity at any level", () => {
    expect(BOSSES).toHaveLength(10);
    for (const b of BOSSES) {
      expect(b.name.length).toBeGreaterThan(0);
      expect(b.desc.length).toBeGreaterThan(0);
    }
    // boss ambush at a non-multiple-of-10 level
    expect(BOSSES.map((b) => b.name)).toContain(monsterName(7, "boss"));
    // non-boss rarity at a normal level stays a normal monster
    expect(MONSTERS.map((m) => m.name)).toContain(monsterName(7, "rar"));
  });

  it("bossIndex cycles through all 10 bosses and bossRank clamps to 1..10", () => {
    const seen = new Set<number>();
    for (let lvl = 1; lvl <= 10; lvl++) seen.add(bossIndex(lvl));
    expect(seen.size).toBe(10);
    expect(bossRank(1)).toBe(1);
    expect(bossRank(10)).toBe(1);
    expect(bossRank(35)).toBe(4);
    expect(bossRank(999)).toBe(10);
  });
});
