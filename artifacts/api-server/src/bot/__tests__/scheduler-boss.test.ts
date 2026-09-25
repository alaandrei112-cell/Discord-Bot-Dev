import { describe, it, expect, vi, afterEach } from "vitest";

// ── Mock discord.js (survival.ts imports EmbedBuilder etc at module level) ────
vi.mock("discord.js", () => {
  const chain = () => {
    const obj: Record<string, unknown> = {};
    const methods = [
      "setColor", "setTitle", "setDescription", "setImage",
      "setFooter", "setTimestamp", "setThumbnail", "addFields",
    ];
    for (const m of methods) obj[m] = () => obj;
    return obj;
  };
  return {
    EmbedBuilder: vi.fn(() => chain()),
    ActionRowBuilder: vi.fn(() => ({ addComponents: vi.fn(() => ({})) })),
    ButtonBuilder: vi.fn(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setLabel: vi.fn().mockReturnThis(),
      setStyle: vi.fn().mockReturnThis(),
      setEmoji: vi.fn().mockReturnThis(),
      setDisabled: vi.fn().mockReturnThis(),
    })),
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  };
});

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
  getRewardMultipliers: vi.fn(() => ({ xpMult: 1, goldMult: 1 })),
}));

// Import pure functions from survival after mocks are set up
import {
  CHEST_RARITIES,
  KEY_CHEST_WEIGHTS,
  LOCKED_CHEST_GOLD,
  computeBossRewards,
  bossMaxHp,
  VETERAN_RANK_CAP,
  VETERAN_MAX_REWARD_MULT,
  rollChest,
  rollChestMultiplier,
  rollEventKeyDrops,
  rollKeyChestType,
  spawnChest,
  spawnLockedChest,
} from "../survival";

// ─── CHEST_RARITIES weight pool ────────────────────────────────────────────────

describe("CHEST_RARITIES weight pool integrity", () => {
  it("has exactly 6 rarity tiers", () => {
    expect(CHEST_RARITIES).toHaveLength(6);
  });

  it("rarity keys are unique", () => {
    const keys = CHEST_RARITIES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("non-zero weights sum to 100", () => {
    const weightedRarities = CHEST_RARITIES.filter((r) => r.weight > 0);
    const total = weightedRarities.reduce((s, r) => s + r.weight, 0);
    expect(total).toBe(100);
  });

  it("regal has weight 0 (key-only, not rolled via rollChest)", () => {
    const regal = CHEST_RARITIES.find((r) => r.key === "regal");
    expect(regal).toBeDefined();
    expect(regal!.weight).toBe(0);
  });

  it("each rarity has min < max gold range", () => {
    for (const r of CHEST_RARITIES) {
      expect(r.min).toBeLessThan(r.max);
    }
  });

  it("gold ranges are non-overlapping and ascending across tiers", () => {
    const rollable = CHEST_RARITIES.filter((r) => r.weight > 0);
    for (let i = 1; i < rollable.length; i++) {
      expect(rollable[i]!.min).toBeGreaterThanOrEqual(rollable[i - 1]!.max);
    }
  });
});

// ─── rollChest: rarity selection ──────────────────────────────────────────────

describe("rollChest rarity selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns bronz when roll lands in the first weight bucket (roll=0)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { rarity } = rollChest();
    expect(rarity.key).toBe("bronz");
  });

  it("returns bronz when roll is just inside the bronz bucket (weight=58)", () => {
    // Total weight = 100; bronz bucket = [0, 58)
    // random() returns a fraction of total (100), so 0.579 * 100 = 57.9 → bronz
    vi.spyOn(Math, "random").mockReturnValue(0.579);
    const { rarity } = rollChest();
    expect(rarity.key).toBe("bronz");
  });

  it("returns argint when roll lands in the argint bucket (weight 58–85)", () => {
    // 0.60 * 100 = 60 → past bronz (58), into argint (28)
    vi.spyOn(Math, "random").mockReturnValue(0.60);
    const { rarity } = rollChest();
    expect(rarity.key).toBe("argint");
  });

  it("returns aur when roll lands in the aur bucket (weight 86–96)", () => {
    // 0.87 * 100 = 87 → past bronz+argint (86), into aur (11)
    vi.spyOn(Math, "random").mockReturnValue(0.87);
    const { rarity } = rollChest();
    expect(rarity.key).toBe("aur");
  });

  it("returns mitic when roll lands in the last bucket (weight 97–99)", () => {
    // 0.98 * 100 = 98 → past bronz+argint+aur (97), into mitic (3)
    vi.spyOn(Math, "random").mockReturnValue(0.98);
    const { rarity } = rollChest();
    expect(rarity.key).toBe("mitic");
  });

  it("gold payout is within the rarity's [min, max] range", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { rarity, gold } = rollChest();
    expect(gold).toBeGreaterThanOrEqual(rarity.min);
    expect(gold).toBeLessThanOrEqual(rarity.max);
  });
});

// ─── rollChestMultiplier ───────────────────────────────────────────────────────

describe("rollChestMultiplier probabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 3 when roll < 0.08", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.07);
    expect(rollChestMultiplier()).toBe(3);
  });

  it("returns 2 when roll is in [0.08, 0.30)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.20);
    expect(rollChestMultiplier()).toBe(2);
  });

  it("returns 1 when roll is >= 0.30", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.50);
    expect(rollChestMultiplier()).toBe(1);
  });

  it("returns exactly 1 | 2 | 3 — never another value", () => {
    const rolls = [0, 0.04, 0.08, 0.15, 0.30, 0.5, 0.99];
    for (const r of rolls) {
      vi.spyOn(Math, "random").mockReturnValue(r);
      const mult = rollChestMultiplier();
      expect([1, 2, 3]).toContain(mult);
      vi.restoreAllMocks();
    }
  });
});

// ─── bossMaxHp scaling ────────────────────────────────────────────────────────

describe("bossMaxHp scales with level and rarity", () => {
  it("comun boss at level 5 has baseline HP", () => {
    const hp = bossMaxHp(5, "comun");
    expect(hp).toBe(5 * 2000 * 1);
  });

  it("rar boss has 1.5× more HP than comun at the same level", () => {
    const comun = bossMaxHp(10, "comun");
    const rar = bossMaxHp(10, "rar");
    expect(rar).toBeCloseTo(comun * 1.5, 0);
  });

  it("epic boss has 2.5× more HP than comun at the same level", () => {
    const comun = bossMaxHp(10, "comun");
    const epic = bossMaxHp(10, "epic");
    expect(epic).toBeCloseTo(comun * 2.5, 0);
  });

  it("legendar boss has 4× more HP than comun at the same level", () => {
    const comun = bossMaxHp(10, "comun");
    const legendar = bossMaxHp(10, "legendar");
    expect(legendar).toBeCloseTo(comun * 4, 0);
  });

  it("HP increases linearly with level for the same rarity", () => {
    const hp5 = bossMaxHp(5, "comun");
    const hp10 = bossMaxHp(10, "comun");
    expect(hp10).toBe(hp5 * 2);
  });

  it("never returns 0 or negative for any valid input", () => {
    const rarities = ["comun", "rar", "epic", "legendar"] as const;
    for (const r of rarities) {
      expect(bossMaxHp(1, r)).toBeGreaterThan(0);
      expect(bossMaxHp(100, r)).toBeGreaterThan(0);
    }
  });
});

// ─── computeBossRewards ───────────────────────────────────────────────────────

describe("computeBossRewards — damage tracking and distribution", () => {
  it("returns an empty map when no one dealt damage", () => {
    const rewards = computeBossRewards(new Map(), "comun");
    expect(rewards.size).toBe(0);
  });

  it("gives the top-damage dealer 3× base rewards", () => {
    const damage = new Map([["alice", 500], ["bob", 200]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("alice")).toEqual({ rep: 150, gold: 450, xp: 750 });
  });

  it("gives rank 2 and 3 dealers 2× base rewards", () => {
    const damage = new Map([
      ["alice", 500],
      ["bob",   300],
      ["carol", 100],
    ]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("bob")).toEqual({ rep: 100, gold: 300, xp: 500 });
    expect(rewards.get("carol")).toEqual({ rep: 100, gold: 300, xp: 500 });
  });

  it("gives rank 4+ dealers 1× base rewards", () => {
    const damage = new Map([
      ["p1", 1000],
      ["p2",  800],
      ["p3",  600],
      ["p4",  400],
      ["p5",  200],
    ]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("p4")).toEqual({ rep: 50, gold: 150, xp: 250 });
    expect(rewards.get("p5")).toEqual({ rep: 50, gold: 150, xp: 250 });
  });

  it("applies the veteran max-rank bonus ×1.5 at VETERAN_RANK_CAP", () => {
    const damage = new Map([["alice", 500], ["bob", 200]]);
    const hits = new Map([["alice", 4]]);
    const base = computeBossRewards(damage, "rar", hits, 0);
    const maxed = computeBossRewards(damage, "rar", hits, VETERAN_RANK_CAP);
    for (const id of ["alice", "bob"]) {
      const b = base.get(id)!;
      const m = maxed.get(id)!;
      expect(m.rep).toBe(Math.round(b.rep * VETERAN_MAX_REWARD_MULT));
      expect(m.gold).toBe(Math.round(b.gold * VETERAN_MAX_REWARD_MULT));
      expect(m.xp).toBe(Math.round(b.xp * VETERAN_MAX_REWARD_MULT));
    }
  });

  it("does not apply the veteran bonus below the cap", () => {
    const damage = new Map([["alice", 500]]);
    const base = computeBossRewards(damage, "comun", undefined, 0);
    const belowCap = computeBossRewards(damage, "comun", undefined, VETERAN_RANK_CAP - 1);
    expect(belowCap.get("alice")).toEqual(base.get("alice"));
  });

  it("applies rarity multiplier for rar (×1.5)", () => {
    const damage = new Map([["alice", 500]]);
    const comun = computeBossRewards(damage, "comun").get("alice")!;
    const rar = computeBossRewards(damage, "rar").get("alice")!;
    expect(rar.rep).toBe(Math.round(comun.rep * 1.5));
    expect(rar.gold).toBe(Math.round(comun.gold * 1.5));
    expect(rar.xp).toBe(Math.round(comun.xp * 1.5));
  });

  it("applies rarity multiplier for epic (×2)", () => {
    const damage = new Map([["alice", 500]]);
    const comun = computeBossRewards(damage, "comun").get("alice")!;
    const epic = computeBossRewards(damage, "epic").get("alice")!;
    expect(epic.rep).toBe(Math.round(comun.rep * 2));
    expect(epic.gold).toBe(Math.round(comun.gold * 2));
    expect(epic.xp).toBe(Math.round(comun.xp * 2));
  });

  it("applies rarity multiplier for legendar (×3)", () => {
    const damage = new Map([["alice", 500]]);
    const comun = computeBossRewards(damage, "comun").get("alice")!;
    const legendar = computeBossRewards(damage, "legendar").get("alice")!;
    expect(legendar.rep).toBe(Math.round(comun.rep * 3));
    expect(legendar.gold).toBe(Math.round(comun.gold * 3));
    expect(legendar.xp).toBe(Math.round(comun.xp * 3));
  });

  it("sorts participants by damage descending regardless of insertion order", () => {
    const damage = new Map([
      ["low",  100],
      ["high", 900],
      ["mid",  400],
    ]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("high")!.rep).toBeGreaterThan(rewards.get("mid")!.rep);
    expect(rewards.get("mid")!.rep).toBeGreaterThanOrEqual(rewards.get("low")!.rep);
  });

  it("every participant who dealt damage receives a reward entry", () => {
    const participants = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const damage = new Map(participants.map((id, i) => [id, (i + 1) * 100]));
    const rewards = computeBossRewards(damage, "comun");
    for (const id of participants) {
      expect(rewards.has(id)).toBe(true);
    }
  });

  it("all reward values are positive integers", () => {
    const damage = new Map([["alice", 500], ["bob", 200], ["carol", 50]]);
    const rewards = computeBossRewards(damage, "epic");
    for (const [, r] of rewards) {
      expect(r.rep).toBeGreaterThan(0);
      expect(r.gold).toBeGreaterThan(0);
      expect(r.xp).toBeGreaterThan(0);
      expect(Number.isInteger(r.rep)).toBe(true);
      expect(Number.isInteger(r.gold)).toBe(true);
      expect(Number.isInteger(r.xp)).toBe(true);
    }
  });

  it("a single participant receives the top-rank (×3) multiplier", () => {
    const damage = new Map([["solo", 300]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("solo")).toEqual({ rep: 150, gold: 450, xp: 750 });
  });

  // Guard: entries with damage <= 0 must be skipped regardless of how they
  // ended up in damageBy (e.g. duplicate interaction bug writing 0 damage).
  // Players who never hit the boss should not receive rewards even if they
  // appear in the map with a zero or negative value.
  it("skips entries with damage === 0 (player present but never hit)", () => {
    const damage = new Map([["hitter", 400], ["ghost", 0]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.has("ghost")).toBe(false);
    expect(rewards.has("hitter")).toBe(true);
  });

  it("skips entries with damage < 0 (defensive: impossible in practice but guarded)", () => {
    const damage = new Map([["hitter", 200], ["invalid", -50]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.has("invalid")).toBe(false);
    expect(rewards.has("hitter")).toBe(true);
  });

  it("returns empty map when all entries have damage <= 0", () => {
    const damage = new Map([["ghost1", 0], ["ghost2", -1]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.size).toBe(0);
  });

  it("zero-damage player does not shift rank multipliers for real hitters", () => {
    // "ghost" at index 0 before filtering would have stolen the ×3 rank slot;
    // after the guard, "alice" (top hitter) must still receive the ×3 multiplier.
    const damage = new Map([["ghost", 0], ["alice", 500], ["bob", 200]]);
    const rewards = computeBossRewards(damage, "comun");
    expect(rewards.get("alice")).toEqual({ rep: 150, gold: 450, xp: 750 });
    expect(rewards.get("bob")).toEqual({ rep: 100, gold: 300, xp: 500 });
    expect(rewards.has("ghost")).toBe(false);
  });

  // Design decision: escape rewards use the same formula as kill rewards.
  // Rationale: players who dealt damage to a boss that escaped still invested
  // resources (HP, abilities) and deserve recognition proportional to their
  // contribution. Full-kill rewards for a kill; same scaled rewards for an
  // escape (the boss "won", so the economy impact is already lower because
  // fewer players typically survive to the escape timer with meaningful damage).
  // If a reduced-reward escape path is desired in future, add a `escaped`
  // boolean parameter and apply a separate multiplier here.
});

// ─── Boss level formula (inline in fireFinalBoss) ─────────────────────────────
//
// The actual formula from scheduler.ts:
//   avgLevel = ceil(sum(monsterLevel) / n)   — fallback 1 when no survivors
//   bossLevel = max(5, ceil(avgLevel / 2))
//
// We test it here as a pure helper to lock in the expected behaviour.

function computeBossLevel(aliveLevels: number[]): number {
  const avgLevel = aliveLevels.length
    ? Math.ceil(aliveLevels.reduce((s, l) => s + l, 0) / aliveLevels.length)
    : 1;
  return Math.max(5, Math.ceil(avgLevel / 2));
}

describe("fireFinalBoss boss-level formula", () => {
  it("falls back to level 5 when there are no survivors", () => {
    expect(computeBossLevel([])).toBe(5);
  });

  it("returns minimum level 5 even for low-level survivor groups", () => {
    expect(computeBossLevel([1, 2, 1])).toBe(5);
  });

  it("scales up from level 5 for higher survivor groups", () => {
    // avg = ceil(20) = 20 → bossLevel = ceil(10) = 10
    expect(computeBossLevel([20])).toBe(10);
  });

  it("uses ceiling division for average and boss level", () => {
    // levels [5, 6]: avg = ceil(11/2) = 6 → bossLevel = ceil(3) = 3 → max(5,3)=5
    expect(computeBossLevel([5, 6])).toBe(5);
    // levels [20, 21]: avg = ceil(41/2) = 21 → bossLevel = ceil(10.5) = 11
    expect(computeBossLevel([20, 21])).toBe(11);
  });

  it("for a very high-level group, boss level grows proportionally", () => {
    // avg = 100 → bossLevel = 50
    expect(computeBossLevel([100])).toBe(50);
  });

  it("is deterministic — same input always produces same level", () => {
    const levels = [10, 15, 20, 25];
    expect(computeBossLevel(levels)).toBe(computeBossLevel(levels));
  });
});

// ─── Event expiry timestamp ───────────────────────────────────────────────────
//
// scheduler.ts: expiresAt = new Date(Date.now() + EVENT_DURATION_MS)
// EVENT_DURATION_MS = 60 * 60 * 1000 (one hour)

describe("fireEvent expiry calculation", () => {
  const EVENT_DURATION_MS = 60 * 60 * 1000;

  it("expiry is exactly 1 hour in the future", () => {
    const before = Date.now();
    const expiresAt = new Date(Date.now() + EVENT_DURATION_MS);
    const after = Date.now();

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + EVENT_DURATION_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + EVENT_DURATION_MS);
  });

  it("event is not yet expired immediately after creation", () => {
    const expiresAt = new Date(Date.now() + EVENT_DURATION_MS);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("event is expired after the duration has elapsed (simulated)", () => {
    const now = Date.now();
    const expiresAt = new Date(now + EVENT_DURATION_MS);
    const simulatedFuture = now + EVENT_DURATION_MS + 1;
    expect(expiresAt.getTime()).toBeLessThan(simulatedFuture);
  });
});

// ─── BOSS_RARITY_WEIGHTS sum (scheduler constants) ───────────────────────────
//
// scheduler.ts has BOSS_RARITY_WEIGHTS = [comun:60, rar:25, epic:12, legendar:3]
// These are not exported, so we mirror the constant here to verify the pool.

describe("BOSS_RARITY_WEIGHTS pool", () => {
  const BOSS_RARITY_WEIGHTS: [string, number][] = [
    ["comun", 60], ["rar", 25], ["epic", 12], ["legendar", 3],
  ];

  it("weight pool sums to exactly 100", () => {
    const total = BOSS_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    expect(total).toBe(100);
  });

  it("comun is the most common rarity (highest weight)", () => {
    const sorted = [...BOSS_RARITY_WEIGHTS].sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("comun");
  });

  it("legendar is the rarest (lowest weight)", () => {
    const sorted = [...BOSS_RARITY_WEIGHTS].sort((a, b) => a[1] - b[1]);
    expect(sorted[0]![0]).toBe("legendar");
  });

  it("all weights are positive integers", () => {
    for (const [, w] of BOSS_RARITY_WEIGHTS) {
      expect(w).toBeGreaterThan(0);
      expect(Number.isInteger(w)).toBe(true);
    }
  });

  it("covers exactly the 4 boss rarities: comun, rar, epic, legendar", () => {
    const keys = BOSS_RARITY_WEIGHTS.map(([k]) => k).sort();
    expect(keys).toEqual(["comun", "epic", "legendar", "rar"]);
  });
});

// ─── Fuzz: rollChest gold payout always within [min, max] ─────────────────────

describe("rollChest gold payout range (10 000 rolls)", () => {
  it("every gold value is within [rarity.min, rarity.max] for every roll", () => {
    const RUNS = 10_000;
    for (let i = 0; i < RUNS; i++) {
      const { rarity, gold } = rollChest();
      expect(gold).toBeGreaterThanOrEqual(rarity.min);
      expect(gold).toBeLessThanOrEqual(rarity.max);
    }
  });
});

// ─── Fuzz: spawnChest gold payout always within [min, max] ────────────────────

describe("spawnChest gold payout range (10 000 rolls per rarity)", () => {
  const RUNS = 10_000;
  for (const rarity of CHEST_RARITIES) {
    it(`every gold value is within [${rarity.min}, ${rarity.max}] for rarity "${rarity.key}"`, () => {
      for (let i = 0; i < RUNS; i++) {
        const result = spawnChest(rarity.key);
        expect(result).not.toBeNull();
        expect(result!.gold).toBeGreaterThanOrEqual(rarity.min);
        expect(result!.gold).toBeLessThanOrEqual(rarity.max);
      }
    });
  }

  it("returns null for an unknown rarity key", () => {
    expect(spawnChest("nonexistent")).toBeNull();
  });
});

// ─── Fuzz: spawnLockedChest gold payout always within LOCKED_CHEST_GOLD ranges ─

describe("spawnLockedChest gold payout range (10 000 rolls per rarity)", () => {
  const RUNS = 10_000;
  const lockedKeys = Object.keys(LOCKED_CHEST_GOLD);

  for (const key of lockedKeys) {
    const range = LOCKED_CHEST_GOLD[key]!;
    it(`every gold value is within [${range.min}, ${range.max}] for locked rarity "${key}"`, () => {
      for (let i = 0; i < RUNS; i++) {
        const result = spawnLockedChest(key);
        expect(result).not.toBeNull();
        expect(result!.gold).toBeGreaterThanOrEqual(range.min);
        expect(result!.gold).toBeLessThanOrEqual(range.max);
      }
    });
  }

  it("returns null for an unknown locked rarity key", () => {
    expect(spawnLockedChest("nonexistent")).toBeNull();
  });
});

// ─── Fuzz: spawnLockedChest fallback (rarity.min×2 / rarity.max×2) economy ─────
// Exercises the untested fallback path: a rarity present in CHEST_RARITIES but
// absent from LOCKED_CHEST_GOLD. If a new locked rarity tier is ever added
// without a matching LOCKED_CHEST_GOLD entry, the payout doubles the base chest
// range. These tests pin that formula so the fallback can't silently drift into
// off-economy territory.

describe("spawnLockedChest fallback gold payout range (10 000 rolls per rarity)", () => {
  const RUNS = 10_000;
  const fallbackRarities = CHEST_RARITIES.filter(
    (r) => !(r.key in LOCKED_CHEST_GOLD),
  );

  it("there is at least one CHEST_RARITY without a LOCKED_CHEST_GOLD entry (fallback is reachable)", () => {
    expect(fallbackRarities.length).toBeGreaterThan(0);
  });

  for (const rarity of fallbackRarities) {
    const expectedMin = rarity.min * 2;
    const expectedMax = rarity.max * 2;
    it(`every fallback gold value is within [${expectedMin}, ${expectedMax}] for rarity "${rarity.key}"`, () => {
      let sawMin = false;
      let sawMax = false;
      for (let i = 0; i < RUNS; i++) {
        const result = spawnLockedChest(rarity.key);
        expect(result).not.toBeNull();
        expect(result!.rarity.key).toBe(rarity.key);
        expect(result!.gold).toBeGreaterThanOrEqual(expectedMin);
        expect(result!.gold).toBeLessThanOrEqual(expectedMax);
        if (result!.gold === expectedMin) sawMin = true;
        if (result!.gold === expectedMax) sawMax = true;
      }
      // Across 10 000 rolls the full inclusive range should be hit, confirming
      // the formula spans exactly [min×2, max×2] with no off-by-one truncation.
      expect(sawMin).toBe(true);
      expect(sawMax).toBe(true);
    });
  }
});

// ─── rollKeyChestType ──────────────────────────────────────────────────────────

const VALID_KEY_TYPES = ["rar", "epic", "regal", "oase", "fum", "cavaler"] as const;

describe("rollKeyChestType weight pool integrity", () => {
  it("KEY_CHEST_WEIGHTS entries sum to 100 (roll range matches weight pool)", () => {
    // Reads from the live production array — fails immediately if weights are
    // edited without this expectation being updated, catching silent economy drift.
    const total = KEY_CHEST_WEIGHTS.reduce((s, k) => s + k.weight, 0);
    expect(total).toBe(100);
  });

  it("every keyType in KEY_CHEST_WEIGHTS is one of the known valid types", () => {
    for (const { keyType } of KEY_CHEST_WEIGHTS) {
      expect(VALID_KEY_TYPES).toContain(keyType);
    }
  });
});

describe("rollKeyChestType: every result is a valid key type (10 000 rolls)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never produces an unknown key type across 10 000 random rolls", () => {
    for (let i = 0; i < 10_000; i++) {
      const result = rollKeyChestType();
      expect(VALID_KEY_TYPES).toContain(result);
    }
  });

  it('fallback path (Math.random === 1.0) returns "rar" (a valid key type)', () => {
    vi.spyOn(Math, "random").mockReturnValue(1.0);
    const result = rollKeyChestType();
    expect(result).toBe("rar");
    expect(VALID_KEY_TYPES).toContain(result);
  });

  it('returns "rar" when roll lands in the first bucket (Math.random = 0)', () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollKeyChestType()).toBe("rar");
  });

  it('returns "epic" when roll lands in the epic bucket (Math.random = 0.65)', () => {
    // 0.65 * 100 = 65; past rar(40) → roll=25; 25 < 25 (epic) is the boundary, so use 0.64.
    vi.spyOn(Math, "random").mockReturnValue(0.64);
    expect(rollKeyChestType()).toBe("epic");
  });

  it('returns "regal" when roll lands in the regal bucket (Math.random = 0.95)', () => {
    // 0.95 * 100 = 95; past rar(40) + epic(25) → 30; past regal(15) → 15; use 0.75 for the regal bucket.
    vi.spyOn(Math, "random").mockReturnValue(0.75);
    expect(rollKeyChestType()).toBe("regal");
  });
});

// ─── rollEventKeyDrops ─────────────────────────────────────────────────────────

describe("rollEventKeyDrops: every awarded key type is valid", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("every value in the returned map is one of the known valid key types when all participants drop", () => {
    // Math.random = 0.0 is below the 0.35 drop-chance threshold, so every
    // participant receives a key. rollKeyChestType also reads Math.random and
    // maps 0.0 * 100 = 0 → first bucket → "rar", which is a valid key type.
    vi.spyOn(Math, "random").mockReturnValue(0.0);
    const ids = ["u1", "u2", "u3", "u4", "u5"];
    const drops = rollEventKeyDrops(ids);
    expect(drops.size).toBe(ids.length);
    for (const [, keyType] of drops) {
      expect(VALID_KEY_TYPES).toContain(keyType);
    }
  });

  it("participants who do not win the drop chance are absent from the returned map", () => {
    // Math.random = 0.5 is above the 0.35 drop-chance threshold, so no
    // participant receives a key and the map must be empty.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const ids = ["u1", "u2", "u3", "u4", "u5"];
    const drops = rollEventKeyDrops(ids);
    expect(drops.size).toBe(0);
  });
});
