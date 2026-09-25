import { describe, it, expect, vi, beforeEach } from "vitest";

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
import {
  empowerMult,
  shieldReduction,
  bonusMult,
  monsterMaxHp,
  monsterSpawnHp,
  veteranRank,
  veteranMult,
  veteranRankFor,
  VETERAN_RANK_CAP,
  VETERAN_MAX_REWARD_MULT,
  veteranRewardMult,
  reachesVeteranCapOnKill,
  finalBossVeteranCapLine,
  monsterDmgRange,
  monsterHitPct,
  monsterReward,
  isMiniBoss,
  rollRarity,
  upgradeCost,
  companionStats,
  zoneFor,
  levelTitle,
  shopPrice,
  doCombat,
  BOSSES,
  bossIndex,
  buildResultText,
  buildCombatEmbed,
  RARITY_WEIGHTS,
  TALISMANS,
  TALISMAN_MAX_LEVEL,
  talismanValue,
  talismanDesc,
  talismanUpgradeCost,
  prestigeGoldMult,
  PRESTIGE_GOLD_BONUS,
  formatItemsFarmed,
  buildDeathEmbed,
  buildRetreatEmbed,
  ITEMS,
  CLASS_POWERS,
  classPowerLevel,
  type TalismanKey,
  type CombatResult,
} from "../survival";

import { getActiveBattleEvent, consumeStormDrain } from "../combat-events";
import { getCombatModifiers } from "../status-effects";
import type { EventParticipant, Player } from "@workspace/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParticipant(overrides: Partial<EventParticipant> = {}): EventParticipant {
  return {
    id: 1,
    eventId: 10,
    guildId: "1382035307607883816",
    discordId: "user1",
    username: "Tester",
    classKey: null,
    maxHp: 100,
    currentHp: 100,
    attackBonus: 0,
    defenseBonus: 0,
    dodgeBonus: 0,
    critBonus: 0,
    monsterLevel: 1,
    monsterCurrentHp: 60,
    monsterRarity: "comun",
    bossCharge: 0,
    empowerNext: false,
    empowerLevel: 0,
    shieldNext: false,
    shieldHp: 0,
    shieldLevel: 0,
    isAlive: true,
    oboli: 0,
    totalDamage: 0,
    xp: 0,
    baseOboli: 0,
    baseXp: 0,
    xpPerKill: 0,
    abilityReadyAt: null,
    shopAttackCount: 0,
    shopDefenseCount: 0,
    shopDodgeCount: 0,
    shopCritCount: 0,
    shopHpCount: 0,
    fled: false,
    itemsFarmed: {},
    pendingLevelup: false,
    joinedAt: new Date(),
    ...overrides,
  };
}

// ─── Pure math: bonusMult, empowerMult, shieldReduction ───────────────────────

describe("bonusMult", () => {
  it("returns 1 at level 1 (no growth yet)", () => {
    expect(bonusMult(1)).toBeCloseTo(1);
  });

  it("grows by 5% per level (compound)", () => {
    expect(bonusMult(2)).toBeCloseTo(1.05);
    expect(bonusMult(3)).toBeCloseTo(1.1025);
  });

  it("clamps to 1 for level <= 0", () => {
    expect(bonusMult(0)).toBeCloseTo(1);
    expect(bonusMult(-5)).toBeCloseTo(1);
  });
});

describe("empowerMult", () => {
  it("returns 1 when level < 1 (ability not owned)", () => {
    expect(empowerMult(0)).toBe(1);
  });

  it("returns 2 at level 1 (×2 base)", () => {
    expect(empowerMult(1)).toBeCloseTo(2);
  });

  it("grows by 5% per level above 1", () => {
    // level 2: 1 + bonusMult(2) = 1 + 1.05 = 2.05
    expect(empowerMult(2)).toBeCloseTo(2.05);
  });
});

describe("shieldReduction", () => {
  it("returns 0 when level < 1 (ability not owned)", () => {
    expect(shieldReduction(0)).toBe(0);
  });

  it("returns 0.5 at level 1", () => {
    expect(shieldReduction(1)).toBeCloseTo(0.5);
  });

  it("caps at 0.9 regardless of level", () => {
    expect(shieldReduction(100)).toBe(0.9);
  });

  it("grows between level 1 and cap", () => {
    const r1 = shieldReduction(1);
    const r5 = shieldReduction(5);
    expect(r5).toBeGreaterThan(r1);
    expect(r5).toBeLessThanOrEqual(0.9);
  });
});

// ─── Monster stats ─────────────────────────────────────────────────────────────

describe("isMiniBoss", () => {
  it("is false for level 0", () => expect(isMiniBoss(0)).toBe(false));
  it("is true for multiples of 10 > 0", () => {
    expect(isMiniBoss(10)).toBe(true);
    expect(isMiniBoss(20)).toBe(true);
    expect(isMiniBoss(100)).toBe(true);
  });
  it("is false for non-multiples", () => {
    expect(isMiniBoss(5)).toBe(false);
    expect(isMiniBoss(11)).toBe(false);
  });
});

describe("monsterMaxHp", () => {
  it("uses base formula 40 + level * 15 for normal levels", () => {
    expect(monsterMaxHp(1)).toBe(40 + 15);
    expect(monsterMaxHp(5)).toBe(40 + 75);
  });

  it("multiplies by 2.5 for mini-boss levels", () => {
    const base = 40 + 10 * 15;
    expect(monsterMaxHp(10)).toBe(Math.round(base * 2.5));
  });
});

// ─── Boss veteran ranks ────────────────────────────────────────────────────

describe("veteran ranks", () => {
  it("rank 0 with no kills, rank 1 after the first kill", () => {
    expect(veteranRank(0)).toBe(0);
    expect(veteranRank(1)).toBe(1);
    expect(veteranRank(4)).toBe(1);
  });

  it("ranks up every 5 kills, capped at VETERAN_RANK_CAP", () => {
    expect(veteranRank(5)).toBe(2);
    expect(veteranRank(10)).toBe(3);
    expect(veteranRank(15)).toBe(4);
    expect(veteranRank(20)).toBe(5);
    expect(veteranRank(25)).toBe(6);
    expect(veteranRank(45)).toBe(10);
    expect(veteranRank(50)).toBe(VETERAN_RANK_CAP);
    expect(veteranRank(999)).toBe(VETERAN_RANK_CAP);
  });

  it("multiplier is +20% per rank, capped at 3x (rank 10)", () => {
    expect(veteranMult(0)).toBeCloseTo(1);
    expect(veteranMult(1)).toBeCloseTo(1.2);
    expect(veteranMult(5)).toBeCloseTo(2);
    expect(veteranMult(10)).toBeCloseTo(3);
    expect(veteranMult(11)).toBeCloseTo(3);
    expect(veteranMult(200)).toBeCloseTo(3);
  });

  it("veteranRankFor only applies to boss fights and uses the boss's own kill count", () => {
    const idx = String(bossIndex(10));
    const kills = { [idx]: 6 };
    expect(veteranRankFor(10, "boss", kills)).toBe(2);
    expect(veteranRankFor(11, "comun", kills)).toBe(0);
    expect(veteranRankFor(10, "boss", {})).toBe(0);
    expect(veteranRankFor(10, "boss", null)).toBe(0);
  });

  it("monsterSpawnHp scales boss HP by the veteran multiplier", () => {
    const idx = String(bossIndex(10));
    expect(monsterSpawnHp(10, "boss", { [idx]: 1 })).toBe(Math.round(monsterMaxHp(10, "boss") * 1.2));
    expect(monsterSpawnHp(10, "boss", null)).toBe(monsterMaxHp(10, "boss"));
    expect(monsterSpawnHp(7, "comun", { [String(bossIndex(7))]: 20 })).toBe(monsterMaxHp(7, "comun"));
  });

  it("veteranRewardMult is 1 below the cap and 1.5 at/above it", () => {
    expect(veteranRewardMult(0)).toBe(1);
    expect(veteranRewardMult(VETERAN_RANK_CAP - 1)).toBe(1);
    expect(veteranRewardMult(VETERAN_RANK_CAP)).toBe(VETERAN_MAX_REWARD_MULT);
    expect(veteranRewardMult(VETERAN_RANK_CAP + 5)).toBe(VETERAN_MAX_REWARD_MULT);
  });

  it("reachesVeteranCapOnKill is true only for the kill crossing sub-cap → cap", () => {
    // Rank 10 is reached at 45 kills, so the transition kill is the one made at 44 prior kills.
    expect(reachesVeteranCapOnKill(43)).toBe(false);
    expect(reachesVeteranCapOnKill(44)).toBe(true);
    expect(reachesVeteranCapOnKill(45)).toBe(false);
    expect(reachesVeteranCapOnKill(0)).toBe(false);
    expect(reachesVeteranCapOnKill(999)).toBe(false);
  });

  it("finalBossVeteranCapLine celebrates only the kill crossing sub-cap → cap (standalone/final boss path)", () => {
    // Rank 10 is reached at 45 kills → the 45th kill (44 prior) is the transition.
    expect(finalBossVeteranCapLine(44)).toContain("RANG VETERAN MAXIM ATINS");
    expect(finalBossVeteranCapLine(44)).toContain(`×${VETERAN_MAX_REWARD_MULT}`);
    expect(finalBossVeteranCapLine(43)).toBe("");
    expect(finalBossVeteranCapLine(45)).toBe("");
    expect(finalBossVeteranCapLine(0)).toBe("");
    // DB read failure (null) must not throw or celebrate.
    expect(finalBossVeteranCapLine(null)).toBe("");
  });

  it("doCombat: flags veteranRankMaxedNow only on the kill that reaches the cap", () => {
    const idx = String(bossIndex(10));
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const p = makeParticipant({ monsterLevel: 10, monsterRarity: "boss", monsterCurrentHp: 1, attackBonus: 10000, critBonus: 100 });
      expect(doCombat(p, null, 1, { [idx]: 44 }).veteranRankMaxedNow).toBe(true);
      expect(doCombat(p, null, 1, { [idx]: 43 }).veteranRankMaxedNow).toBe(false);
      expect(doCombat(p, null, 1, { [idx]: 45 }).veteranRankMaxedNow).toBe(false);
      // Non-boss kills never flag it, even with a huge kill count on record
      const normal = makeParticipant({ monsterLevel: 11, monsterRarity: "comun", monsterCurrentHp: 1, attackBonus: 10000, critBonus: 100 });
      expect(doCombat(normal, null, 1, { [idx]: 44 }).veteranRankMaxedNow).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("doCombat: killing a max-veteran-rank boss grants the ×1.5 bonus reward", () => {
    const idx = String(bossIndex(10));
    const spy = vi.spyOn(Math, "random").mockReturnValue(0); // guaranteed crit + kill
    try {
      const p = makeParticipant({ monsterLevel: 10, monsterRarity: "boss", monsterCurrentHp: 1, attackBonus: 10000, critBonus: 100 });
      const base = monsterReward(10, "boss");
      const maxed = doCombat(p, null, 1, { [idx]: 999 });
      expect(maxed.monsterDefeated).toBe(true);
      expect(maxed.veteranMaxBonus).toBe(true);
      expect(maxed.xpGained).toBe(Math.round(base.xp * VETERAN_MAX_REWARD_MULT));
      expect(maxed.oboliGained).toBe(Math.round(base.oboli * VETERAN_MAX_REWARD_MULT));

      const belowCap = doCombat(p, null, 1, { [idx]: 6 }); // rank 2 — no bonus
      expect(belowCap.monsterDefeated).toBe(true);
      expect(belowCap.veteranMaxBonus).toBe(false);
      expect(belowCap.xpGained).toBe(base.xp);
      expect(belowCap.oboliGained).toBe(base.oboli);
    } finally {
      spy.mockRestore();
    }
  });

  it("doCombat: veteran boss deals ~20% more damage per rank", () => {
    // Force monster hit, no dodge, no crit: random sequence controlled
    const p = makeParticipant({ monsterLevel: 10, monsterRarity: "boss", monsterCurrentHp: 10_000, currentHp: 1_000, maxHp: 1_000, defenseBonus: 0 });
    const idx = String(bossIndex(10));
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const base = doCombat(p);
      const vet = doCombat(p, null, 1, { [idx]: 1 });
      expect(base.monsterHit).toBe(true);
      expect(vet.monsterHit).toBe(true);
      expect(vet.monsterDmg).toBe(Math.round(base.monsterDmg * 1.2));
    } finally {
      spy.mockRestore();
    }
  });
});

describe("monsterDmgRange", () => {
  it("returns [min, max] with min >= 1", () => {
    const [min, max] = monsterDmgRange(1);
    expect(min).toBeGreaterThanOrEqual(1);
    expect(max).toBeGreaterThan(min);
  });

  it("damage range grows with level", () => {
    const [, max1] = monsterDmgRange(1);
    const [, max10] = monsterDmgRange(10);
    expect(max10).toBeGreaterThan(max1);
  });
});

describe("monsterHitPct", () => {
  it("starts around 35% at level 0", () => {
    expect(monsterHitPct(0)).toBeCloseTo(35);
  });

  it("is capped at 90%", () => {
    expect(monsterHitPct(1000)).toBe(90);
  });

  it("mini-boss has +5% compared to same-level normal", () => {
    // Level 10 is a boss; compare to a hypothetical non-boss same level
    // monsterHitPct uses isMiniBoss internally: 35 + 10*1.2 + 5 = 52
    const bossHit = monsterHitPct(10);
    // At level 11 (non-boss): 35 + 11*1.2 = 48.2
    const normalHit = monsterHitPct(11);
    // Boss at level 10 should be 52, non-boss at 11 is 48.2
    expect(bossHit).toBe(Math.min(90, 35 + 10 * 1.2 + 5));
    expect(normalHit).toBe(Math.min(90, 35 + 11 * 1.2));
  });
});

describe("monsterReward", () => {
  it("scales with level", () => {
    const r1 = monsterReward(1);
    const r5 = monsterReward(5);
    expect(r5.xp).toBeGreaterThan(r1.xp);
    expect(r5.oboli).toBeGreaterThan(r1.oboli);
  });

  it("applies rarity multiplier", () => {
    const comun = monsterReward(5, "comun");
    const epic = monsterReward(5, "epic");
    expect(epic.xp).toBeGreaterThan(comun.xp);
  });

  it("defaults to comun multiplier (×1)", () => {
    const r = monsterReward(5);
    expect(r.xp).toBe(Math.round(5 * 10 * 1));
    expect(r.oboli).toBe(Math.round(5 * 3 * 1));
  });
});

// ─── Economy helpers ───────────────────────────────────────────────────────────

describe("upgradeCost", () => {
  it("returns the base cost at level 1 (no growth exponent)", () => {
    // Math.ceil(200 * 1.15^0) = 200
    expect(upgradeCost(1)).toBe(200);
  });

  it("grows by ~15% each level", () => {
    const c1 = upgradeCost(1);
    const c2 = upgradeCost(2);
    expect(c2).toBeCloseTo(c1 * 1.15, 0);
  });
});

describe("shopPrice", () => {
  it("returns base price at count 0", () => {
    // BASE_PRICES.atac = 50; 50 * 1.35^0 = 50
    expect(shopPrice("atac", 0)).toBe(50);
  });

  it("grows by ~35% per count increment (ceil applied)", () => {
    const p0 = shopPrice("atac", 0);
    const p1 = shopPrice("atac", 1);
    // shopPrice applies Math.ceil, so p1 === ceil(p0 * 1.35)
    expect(p1).toBe(Math.ceil(p0 * 1.35));
  });
});

// ─── Rarity rolling ───────────────────────────────────────────────────────────

describe("rollRarity", () => {
  it("always returns boss for mini-boss levels", () => {
    expect(rollRarity(10)).toBe("boss");
    expect(rollRarity(20)).toBe("boss");
  });

  it("returns a valid rarity for normal levels (boss allowed as rare ambush)", () => {
    const valid = new Set(["comun", "rar", "epic", "legendar", "mitic", "boss"]);
    for (let i = 0; i < 30; i++) {
      expect(valid.has(rollRarity(1))).toBe(true);
    }
  });

  it("can ambush with a boss at a normal level when the roll is low", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.001);
    expect(rollRarity(1)).toBe("boss");
    spy.mockRestore();
  });
});

// ─── companionStats ───────────────────────────────────────────────────────────

describe("companionStats", () => {
  it("lup at level 1 gives +2 attack rounded", () => {
    const s = companionStats("lup", 1);
    expect(s.attack).toBe(2);
    expect(s.hp).toBe(0);
  });

  it("lup attack grows with level (5%/level compound)", () => {
    const l1 = companionStats("lup", 1).attack;
    const l3 = companionStats("lup", 3).attack;
    expect(l3).toBeGreaterThanOrEqual(l1);
  });

  it("spirit at level 1 gives +5 hp", () => {
    const s = companionStats("spirit", 1);
    expect(s.hp).toBe(5);
    expect(s.attack).toBe(0);
  });
});

// ─── Progression helpers ───────────────────────────────────────────────────────

describe("zoneFor", () => {
  it("returns the first zone for level 1", () => {
    expect(zoneFor(1).name).toBe("Pădurea Umbrelor");
  });

  it("escalates to a later zone at level 30", () => {
    expect(zoneFor(30).name).toBe("Ținuturile Arse");
  });
});

describe("levelTitle", () => {
  it("returns the correct title for low levels", () => {
    expect(levelTitle(1)).toBe("Umbra Începătorului");
  });

  it("returns a different title for high levels", () => {
    expect(levelTitle(100)).toBe("Eternul Cenușii");
  });
});

// ─── doCombat integration (deterministic via Math.random control) ─────────────

describe("doCombat", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getActiveBattleEvent).mockReturnValue(null);
    vi.mocked(consumeStormDrain).mockReturnValue(0);
    vi.mocked(getCombatModifiers).mockReturnValue({ critAdd: 0, damageMult: 1, damageTakenMult: 1 });
  });

  it("always crits when critBonus is 100 and random < 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // < 100/100 → crit; also hits monster
    const p = makeParticipant({ critBonus: 100, monsterCurrentHp: 9999, currentHp: 100 });
    const r = doCombat(p);
    expect(r.isCrit).toBe(true);
    expect(r.playerDmg).toBeGreaterThan(0);
  });

  it("never crits when critBonus is 0 and random is always 0.99", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const p = makeParticipant({ critBonus: 0, monsterCurrentHp: 9999 });
    const r = doCombat(p);
    expect(r.isCrit).toBe(false);
  });

  it("defeats monster when playerDmg >= monsterCurrentHp", () => {
    // Force high attack: attackBonus 10000 and crit
    vi.spyOn(Math, "random").mockReturnValue(0); // 0 → crit fires (0 < any%), rand becomes min
    const p = makeParticipant({ attackBonus: 10000, critBonus: 100, monsterCurrentHp: 1, monsterLevel: 1 });
    const r = doCombat(p);
    expect(r.monsterDefeated).toBe(true);
    expect(r.xpGained).toBeGreaterThan(0);
    expect(r.oboliGained).toBeGreaterThan(0);
    expect(r.newMonsterLevel).toBe(2);
  });

  it("monster does NOT attack when monster is defeated in the same round", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p = makeParticipant({ attackBonus: 10000, critBonus: 100, monsterCurrentHp: 1 });
    const r = doCombat(p);
    expect(r.monsterDefeated).toBe(true);
    expect(r.monsterHit).toBe(false);
    expect(r.monsterDmg).toBe(0);
  });

  it("empower multiplies damage by empowerMult(empowerLevel)", () => {
    // Force deterministic non-crit, no battle event
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 0.99 → no crit, no monster hit
    const base = makeParticipant({ attackBonus: 0, critBonus: 0, monsterCurrentHp: 9999 });
    const empowered = makeParticipant({ attackBonus: 0, critBonus: 0, monsterCurrentHp: 9999, empowerNext: true, empowerLevel: 1 });

    // Both use Math.random() → Math.floor(0.99 * (20-10+1)) + 10 = 20+10 = 20
    const rBase = doCombat(base);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const rEmp = doCombat(empowered);

    // empowered damage should be approximately base * empowerMult(1) ≈ base * 2
    expect(rEmp.playerDmg).toBeGreaterThan(rBase.playerDmg);
    expect(rEmp.usedEmpower).toBe(true);
  });

  it("shield reduces incoming monster damage", () => {
    // Force monster to always hit and never dodge
    // Math.random sequence: [crit check, rand for dmg, monster hit, dodge]
    // We want: no crit (0.99), monster not killed, monster hits (0), no dodge (0.99), dmg roll (0)
    const sequence = [0.99, 0, 0, 0.99, 0];
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[idx++ % sequence.length]!);

    const noShield = makeParticipant({ critBonus: 0, monsterCurrentHp: 9999, dodgeBonus: 0, shieldNext: false, shieldLevel: 0 });
    const withShield = makeParticipant({ critBonus: 0, monsterCurrentHp: 9999, dodgeBonus: 0, shieldNext: true, shieldLevel: 1, shieldHp: 200 });

    idx = 0;
    const rNo = doCombat(noShield);
    idx = 0;
    const rWith = doCombat(withShield, null, 1, null, 200);

    if (rNo.monsterHit && !rNo.playerDodged && rWith.monsterHit && !rWith.playerDodged) {
      expect(rWith.monsterDmg).toBeLessThan(rNo.monsterDmg);
      expect(rWith.usedShield).toBe(true);
      expect(rWith.shieldAbsorbed).toBe(rNo.monsterDmg - rWith.monsterDmg);
      expect(rWith.shieldBroke).toBe(false);
      expect(rWith.shieldHpLeft).toBe(200 - rWith.shieldAbsorbed);
    }
  });

  it("shield shatters when its HP can't cover the absorbed damage", () => {
    const sequence = [0.99, 0, 0, 0.99, 0];
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[idx++ % sequence.length]!);

    const p = makeParticipant({ critBonus: 0, monsterCurrentHp: 9999, dodgeBonus: 0, shieldNext: true, shieldLevel: 1 });
    const r = doCombat(p, null, 1, null, 0);

    if (r.monsterHit && !r.playerDodged && r.monsterDmg > 1) {
      expect(r.usedShield).toBe(false);
      expect(r.shieldAbsorbed).toBe(0);
      expect(r.shieldBroke).toBe(true);
      expect(r.shieldHpLeft).toBe(0);
    }
  });

  it("player dies when monster damage brings HP to 0", () => {
    // No crit (0.99), monster not killed, monster hits (0), no dodge (0.99)
    const sequence = [0.99, 0, 0, 0.99, 0];
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequence[idx++ % sequence.length]!);

    const p = makeParticipant({ currentHp: 1, critBonus: 0, monsterCurrentHp: 9999, dodgeBonus: 0, defenseBonus: 0, monsterLevel: 50 });
    const r = doCombat(p);

    if (r.monsterHit && !r.playerDodged) {
      expect(r.playerDied).toBe(true);
      expect(r.newPlayerHp).toBe(0);
    }
  });

  it("storm drain reduces player HP regardless of monster action", () => {
    vi.mocked(consumeStormDrain).mockReturnValue(10);
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const p = makeParticipant({ currentHp: 100, monsterCurrentHp: 9999 });
    const r = doCombat(p);

    expect(r.stormDrain).toBe(10);
    expect(r.newPlayerHp).toBeLessThanOrEqual(90);
  });

  it("battle event damageMult is applied to player damage", () => {
    vi.mocked(getActiveBattleEvent).mockReturnValue({
      key: "explozie",
      emoji: "💥",
      title: "Explozie de Cenușă",
      announce: "",
      damageMult: 1.1,
      monsterMissBonus: 0,
      hpDrain: 0,
      expiresAt: Date.now() + 60000,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const noEvent = makeParticipant({ monsterCurrentHp: 9999, critBonus: 0, attackBonus: 0 });
    vi.mocked(getActiveBattleEvent).mockReturnValue(null);
    const rNo = doCombat(noEvent);

    vi.mocked(getActiveBattleEvent).mockReturnValue({
      key: "explozie",
      emoji: "💥",
      title: "Explozie de Cenușă",
      announce: "",
      damageMult: 1.1,
      monsterMissBonus: 0,
      hpDrain: 0,
      expiresAt: Date.now() + 60000,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const withEvent = makeParticipant({ monsterCurrentHp: 9999, critBonus: 0, attackBonus: 0 });
    const rWith = doCombat(withEvent);

    expect(rWith.playerDmg).toBeGreaterThanOrEqual(rNo.playerDmg);
  });

  it("boss charge fills each round in a boss fight and fires the ability at max", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no crit, monster misses
    // Charge below max: just increments, no ability
    const p1 = makeParticipant({ monsterRarity: "boss", monsterLevel: 10, monsterCurrentHp: 99999, bossCharge: 2, maxHp: 200, currentHp: 200 });
    const r1 = doCombat(p1);
    expect(r1.newBossCharge).toBe(3);
    expect(r1.abilityFired).toBe(false);
    expect(r1.abilityDmg).toBe(0);

    // Charge reaches max: ability fires, damages % of maxHp, resets to 0
    const p2 = makeParticipant({ monsterRarity: "boss", monsterLevel: 10, monsterCurrentHp: 99999, bossCharge: 4, maxHp: 200, currentHp: 200 });
    const r2 = doCombat(p2);
    expect(r2.abilityFired).toBe(true);
    expect(r2.newBossCharge).toBe(0);
    const ab = BOSSES[bossIndex(10)]!.ability;
    const expectedDmg = Math.max(1, Math.round((200 * ab.pct) / 100));
    expect(r2.abilityDmg).toBe(expectedDmg);
    expect(r2.newPlayerHp).toBe(200 - expectedDmg);
    if (ab.steal) expect(r2.abilityHeal).toBe(expectedDmg);
    else expect(r2.abilityHeal).toBe(0);
  });

  it("boss charge resets to 0 when the monster is defeated and never fires on non-boss fights", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const pKill = makeParticipant({ monsterRarity: "boss", monsterLevel: 10, monsterCurrentHp: 1, attackBonus: 10000, bossCharge: 4 });
    const rKill = doCombat(pKill);
    expect(rKill.monsterDefeated).toBe(true);
    expect(rKill.newBossCharge).toBe(0);
    expect(rKill.abilityFired).toBe(false);

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const pNormal = makeParticipant({ monsterRarity: "comun", monsterLevel: 3, monsterCurrentHp: 9999, bossCharge: 4 });
    const rNormal = doCombat(pNormal);
    expect(rNormal.abilityFired).toBe(false);
    expect(rNormal.newBossCharge).toBe(4);
  });

  it("levelUp flag fires at every LEVELUP_INTERVAL monster level", () => {
    // Defeat monster at monsterLevel = 4 (next level = 5, 5 % 5 === 0)
    vi.spyOn(Math, "random").mockReturnValue(0);
    const p = makeParticipant({ attackBonus: 10000, critBonus: 100, monsterCurrentHp: 1, monsterLevel: 4 });
    const r = doCombat(p);

    expect(r.monsterDefeated).toBe(true);
    expect(r.newMonsterLevel).toBe(5);
    expect(r.levelUp).toBe(true);
  });
});

describe("buildResultText breakdown lines", () => {
  const baseResult: CombatResult = {
    playerDmg: 15, isCrit: false, baseDmg: 15,
    monsterDefeated: false, monsterHit: false, monsterDmg: 0, playerDodged: false,
    playerDied: false, newMonsterHp: 50, newPlayerHp: 100,
    xpGained: 0, oboliGained: 0, levelUp: false, newMonsterLevel: 1, newMonsterRarity: "comun",
    usedEmpower: false, usedShield: false, shieldAbsorbed: 0, shieldBroke: false, shieldHpLeft: 0, shieldManaDrained: 0, stormDrain: 0, battleEventEmoji: "", hpRegen: 0,
    newBossCharge: 0, abilityFired: false, abilityDmg: 0, abilityHeal: 0, veteranMaxBonus: false,
    veteranRankMaxedNow: false,
  };

  it("shows no breakdown when damage is unmodified", () => {
    const txt = buildResultText(baseResult);
    expect(txt).not.toContain("Daune normale");
  });

  it("shows crit breakdown with base and boosted damage", () => {
    const txt = buildResultText({ ...baseResult, isCrit: true, playerDmg: 30 });
    expect(txt).toContain("Daune normale: **15**");
    expect(txt).toContain("critică ×2");
    expect(txt).toContain("**30**");
  });

  it("shows empower breakdown", () => {
    const txt = buildResultText({ ...baseResult, usedEmpower: true, playerDmg: 23 });
    expect(txt).toContain("putere de clasă");
    expect(txt).toContain("Daune normale: **15**");
  });

  it("falls back to a generic label when damage changed for an unlisted reason", () => {
    const txt = buildResultText({ ...baseResult, playerDmg: 20 });
    expect(txt).toContain("cu bonusuri: **20**");
    expect(txt).not.toContain("cu : ");
  });

  it("shows XP/Oboli base vs boosted only when they differ", () => {
    const kill = { ...baseResult, monsterDefeated: true, xpGained: 125, oboliGained: 40 };
    const boosted = buildResultText(kill, null, { baseXp: 100, baseOboli: 40 });
    expect(boosted).toContain("+125 XP *(normal 100)*");
    expect(boosted).toContain("+40 Oboli");
    expect(boosted).not.toContain("Oboli *(normal");
  });

  it("shows Crista Vieții heal line when provided", () => {
    const kill = { ...baseResult, monsterDefeated: true, xpGained: 10, oboliGained: 5 };
    const txt = buildResultText(kill, null, { baseXp: 10, baseOboli: 5, cristaHeal: 30 });
    expect(txt).toContain("Crista Vieții");
    expect(txt).toContain("+30 HP");
  });

  it("shows Runa Sângelui life-steal line from hpRegen", () => {
    const txt = buildResultText({ ...baseResult, isCrit: true, playerDmg: 30, hpRegen: 8 });
    expect(txt).toContain("Runa Sângelui");
    expect(txt).toContain("+8 HP");
  });

  it("shows the max-veteran trophy line only when veteranMaxBonus is set", () => {
    const kill = { ...baseResult, monsterDefeated: true, xpGained: 150, oboliGained: 45 };
    expect(buildResultText({ ...kill, veteranMaxBonus: true })).toContain("TROFEU DE VETERAN SUPREM");
    expect(buildResultText(kill)).not.toContain("TROFEU DE VETERAN SUPREM");
  });

  it("shows the rank-maxed celebration line only when veteranRankMaxedNow is set", () => {
    const kill = { ...baseResult, monsterDefeated: true, xpGained: 150, oboliGained: 45 };
    const txt = buildResultText({ ...kill, veteranRankMaxedNow: true });
    expect(txt).toContain("RANG VETERAN MAXIM ATINS");
    expect(txt).toContain(`×${VETERAN_MAX_REWARD_MULT}`);
    expect(buildResultText(kill)).not.toContain("RANG VETERAN MAXIM ATINS");
  });
});

// ─── xpPerKill level-up bonus ─────────────────────────────────────────────────

describe("doCombat xpPerKill bonus", () => {
  it("adds xpPerKill on top of the monster reward when the monster dies", () => {
    const p = makeParticipant({ attackBonus: 10000, critBonus: 100, monsterCurrentHp: 1, monsterLevel: 1, xpPerKill: 5 });
    const r = doCombat(p);
    expect(r.monsterDefeated).toBe(true);
    expect(r.xpGained).toBe(monsterReward(1, "comun").xp + 5);
  });

  it("gives no bonus XP when the monster survives", () => {
    const p = makeParticipant({ attackBonus: 0, critBonus: 0, monsterCurrentHp: 9999, xpPerKill: 5 });
    const r = doCombat(p);
    expect(r.xpGained).toBe(0);
  });
});

// ─── buildCombatEmbed permanent bonuses ───────────────────────────────────────

describe("buildCombatEmbed permanent bonuses", () => {
  it("shows class, talisman and xpPerKill lines when present", () => {
    const p = makeParticipant({ xpPerKill: 10 });
    const player = { class: "strajer", talisman: "piatra_eco", talismanLevel: 2 } as unknown as Player;
    const desc = buildCombatEmbed(p, "", null, player).data.description!;
    expect(desc).toContain("Bonusurile tale");
    expect(desc).toContain("Strajerul");
    expect(desc).toContain("Piatra Eco");
    expect(desc).toContain("Nv.2");
    expect(desc).toContain("+10 XP");
  });

  it("shows the xpPerKill bonus in the reward line", () => {
    const p = makeParticipant({ xpPerKill: 5, monsterLevel: 1, monsterRarity: "comun" });
    const desc = buildCombatEmbed(p).data.description!;
    expect(desc).toContain(`${monsterReward(1, "comun").xp} XP *(+5 bonus)*`);
  });

  it("omits the bonus section when there are no permanent bonuses", () => {
    const desc = buildCombatEmbed(makeParticipant()).data.description!;
    expect(desc).not.toContain("Bonusurile tale");
  });
});

// ─── Talisman levels (per-talisman, max 5) ────────────────────────────────────

describe("talisman levels", () => {
  const keys = Object.keys(TALISMANS) as TalismanKey[];

  it("every talisman has exactly TALISMAN_MAX_LEVEL strictly increasing values", () => {
    for (const key of keys) {
      const vals = TALISMANS[key].values;
      expect(vals).toHaveLength(TALISMAN_MAX_LEVEL);
      for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  it("keeps original Nv.1/Nv.2 values (backwards compat)", () => {
    expect(talismanValue("crista_vietii", 1)).toBe(15);
    expect(talismanValue("crista_vietii", 2)).toBe(30);
    expect(talismanValue("runa_sangelui", 1)).toBe(8);
    expect(talismanValue("runa_sangelui", 2)).toBe(18);
    expect(talismanValue("giulgiul_stins", 1)).toBe(3);
    expect(talismanValue("giulgiul_stins", 2)).toBe(7);
    expect(talismanValue("sfera_abisului", 1)).toBe(5);
    expect(talismanValue("sfera_abisului", 2)).toBe(12);
    expect(talismanValue("piatra_eco", 1)).toBe(25);
    expect(talismanValue("piatra_eco", 2)).toBe(60);
  });

  it("clamps low levels to 1 and extrapolates past the table by the last delta", () => {
    expect(talismanValue("piatra_eco", 0)).toBe(talismanValue("piatra_eco", 1));
    expect(talismanValue("piatra_eco", -3)).toBe(talismanValue("piatra_eco", 1));
    const vals = TALISMANS.piatra_eco.values;
    const last = vals[vals.length - 1]!;
    const delta = last - vals[vals.length - 2]!;
    expect(talismanValue("piatra_eco", TALISMAN_MAX_LEVEL + 1)).toBe(last + delta);
    expect(talismanValue("piatra_eco", TALISMAN_MAX_LEVEL + 3)).toBe(last + 3 * delta);
  });

  it("keeps values strictly increasing past Nv.5 (infinite levels)", () => {
    for (const key of keys) {
      for (let lvl = 5; lvl < 15; lvl++) {
        expect(talismanValue(key, lvl + 1)).toBeGreaterThan(talismanValue(key, lvl));
      }
    }
  });

  it("talismanDesc embeds the level's value", () => {
    expect(talismanDesc("piatra_eco", 2)).toBe("+60% XP din fiecare monstru ucis");
    expect(talismanDesc("giulgiul_stins", 5)).toContain("-22");
  });

  it("upgrade cost escalates with level and keeps the original 1→2 cost", () => {
    const c1 = talismanUpgradeCost("crista_vietii", 1);
    expect(c1.commonQty).toBe(3);
    expect(c1.rareQty).toBe(1);
    const c4 = talismanUpgradeCost("crista_vietii", 4);
    expect(c4.commonQty).toBe(6);
    expect(c4.rareQty).toBe(4);
    expect(c4.common).toBe(TALISMANS.crista_vietii.upgradeItems.common);
    expect(c4.rare).toBe(TALISMANS.crista_vietii.upgradeItems.rare);
  });

  it("requires no tier material below Nv.5, then tier material per rank", () => {
    for (let lvl = 1; lvl < 5; lvl++) {
      expect(talismanUpgradeCost("crista_vietii", lvl).tier).toBeNull();
    }
    const c5 = talismanUpgradeCost("crista_vietii", 5);
    expect(c5.tier).toBe("solz_spectral");
    expect(c5.tierQty).toBe(1);
    const c9 = talismanUpgradeCost("crista_vietii", 9);
    expect(c9.tier).toBe("solz_spectral");
    expect(c9.tierQty).toBe(5);
    const c10 = talismanUpgradeCost("crista_vietii", 10);
    expect(c10.tier).toBe("cristal_abis");
    expect(c10.tierQty).toBe(1);
    const c15 = talismanUpgradeCost("crista_vietii", 15);
    expect(c15.tier).toBe("sange_titan");
    const c20 = talismanUpgradeCost("crista_vietii", 20);
    expect(c20.tier).toBe("fragment_mitic");
    // Tier caps at fragment_mitic for very high levels
    const c99 = talismanUpgradeCost("crista_vietii", 99);
    expect(c99.tier).toBe("fragment_mitic");
    expect(c99.tierQty).toBe((99 % 5) + 1);
  });

  it("doCombat applies giulgiul_stins reduction scaled by level", () => {
    // Force the monster to hit: dodge 0, defense 0
    const p = makeParticipant({ attackBonus: 0, critBonus: 0, dodgeBonus: 0, defenseBonus: 0, monsterCurrentHp: 9999, monsterLevel: 1 });
    // At Nv.5 reduction is 22 — greater than max monster damage at level 1, so damage is always 0
    const r = doCombat(p, "giulgiul_stins", 5);
    if (r.monsterHit && !r.playerDodged) expect(r.monsterDmg).toBe(0);
  });

  it("doCombat applies runa_sangelui regen scaled by level on crit", () => {
    const p = makeParticipant({ attackBonus: 10, critBonus: 100, dodgeBonus: 100, monsterCurrentHp: 9999 });
    const r = doCombat(p, "runa_sangelui", 4);
    expect(r.isCrit).toBe(true);
    expect(r.hpRegen).toBe(40);
  });
});

describe("prestigeGoldMult (prestige gold bonus)", () => {
  it("returns 1 at prestige level 0", () => {
    expect(prestigeGoldMult(0)).toBe(1);
  });

  it("adds PRESTIGE_GOLD_BONUS % per level", () => {
    expect(prestigeGoldMult(1)).toBeCloseTo(1 + PRESTIGE_GOLD_BONUS / 100);
    expect(prestigeGoldMult(3)).toBeCloseTo(1 + (3 * PRESTIGE_GOLD_BONUS) / 100);
    expect(prestigeGoldMult(10)).toBeCloseTo(1 + (10 * PRESTIGE_GOLD_BONUS) / 100);
  });

  it("never goes below 1 for negative levels", () => {
    expect(prestigeGoldMult(-2)).toBe(1);
  });

  it("scales gold rewards as expected", () => {
    expect(Math.round(100 * prestigeGoldMult(2))).toBe(110);
  });
});

describe("formatItemsFarmed (event summary loot line)", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(formatItemsFarmed(null)).toBe("");
    expect(formatItemsFarmed(undefined)).toBe("");
    expect(formatItemsFarmed({})).toBe("");
  });

  it("skips zero quantities and unknown keys", () => {
    expect(formatItemsFarmed({ coama_dragonului: 0 })).toBe("");
    expect(formatItemsFarmed({ not_a_real_item: 3 })).toBe("");
  });

  it("renders known items with emoji, quantity and label", () => {
    const line = formatItemsFarmed({ coama_dragonului: 2 });
    expect(line).toContain("🎒 Pradă adunată:");
    expect(line).toContain("2×");
    expect(line).toContain(ITEMS.coama_dragonului.label);
    expect(line).toContain(ITEMS.coama_dragonului.emoji);
  });

  it("joins multiple items", () => {
    const keys = Object.keys(ITEMS);
    const line = formatItemsFarmed({ [keys[0]!]: 1, [keys[1]!]: 3 });
    expect(line).toContain(" · ");
  });
});

describe("death/retreat embeds show items farmed", () => {
  it("buildDeathEmbed includes the loot line when itemsFarmed is present", () => {
    const embed = buildDeathEmbed({ totalDamage: 100, oboli: 50, xp: 20, itemsFarmed: { coama_dragonului: 1 } });
    const desc = embed.data.description ?? "";
    expect(desc).toContain("Pradă adunată");
    expect(desc).toContain(ITEMS.coama_dragonului.label);
  });

  it("buildDeathEmbed omits the loot line when nothing was farmed", () => {
    const embed = buildDeathEmbed({ totalDamage: 100, oboli: 50, xp: 20, itemsFarmed: {} });
    expect(embed.data.description ?? "").not.toContain("Pradă adunată");
  });

  it("buildRetreatEmbed includes the loot line when itemsFarmed is present", () => {
    const embed = buildRetreatEmbed(5, { totalDamage: 10, oboli: 5, xp: 2, itemsFarmed: { inima_abisului: 2 } });
    const desc = embed.data.description ?? "";
    expect(desc).toContain("Pradă adunată");
    expect(desc).toContain(ITEMS.inima_abisului.label);
  });

  it("summary section appears even with zero damage if loot exists", () => {
    const embed = buildRetreatEmbed(1, { itemsFarmed: { coama_dragonului: 1 } });
    expect(embed.data.description ?? "").toContain("Rezumat Eveniment");
  });
});

describe("class powers", () => {
  it("defines two named powers for every class", () => {
    for (const powers of Object.values(CLASS_POWERS)) {
      expect(powers.power1.label).not.toBe(powers.power2.label);
      expect(powers.power1.description.length).toBeGreaterThan(20);
      expect(powers.power2.description.length).toBeGreaterThan(20);
    }
  });

  it("keeps power levels isolated by class", () => {
    const player = {
      classPowerLevels: {
        cavaler: { power1: 3, power2: 1 },
        umbrolog: { power1: 0, power2: 2 },
      },
    } as Pick<Player, "classPowerLevels">;
    expect(classPowerLevel(player, "cavaler", "power1")).toBe(3);
    expect(classPowerLevel(player, "cavaler", "power2")).toBe(1);
    expect(classPowerLevel(player, "umbrolog", "power1")).toBe(0);
    expect(classPowerLevel(player, "strajer", "power1")).toBe(0);
  });
});
