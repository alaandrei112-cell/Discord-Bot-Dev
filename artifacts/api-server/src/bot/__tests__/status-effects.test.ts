import { describe, it, expect, vi, afterEach } from "vitest";
import { grantEffect, getCombatModifiers, getRewardMultipliers, rollChestEffectKind, buildChestEffectMessage, describeEffectMods, formatCombatEffects, CHEST_EFFECT_ODDS, LOCKED_CHEST_EFFECT_ODDS, grantGuildBoost, restoreGuildBoost, getGuildBoost, clearGuildBoost } from "../status-effects";
import type { EffectDef } from "../status-effects";

// Each test uses a unique ID to avoid cross-test state contamination in the
// shared module-level store.
let idCounter = 0;
function uid(): string { return `test-user-${++idCounter}`; }

function makeEffect(overrides: Partial<EffectDef> & { id: string }): EffectDef {
  return {
    kind: "blessing",
    label: "Test Effect",
    emoji: "⭐",
    flavor: "test",
    durationMs: 10 * 60 * 1000,
    mods: {},
    ...overrides,
  };
}

// ─── getCombatModifiers ────────────────────────────────────────────────────────

describe("getCombatModifiers", () => {
  it("returns neutral defaults when player has no effects", () => {
    const mods = getCombatModifiers(uid());
    expect(mods).toEqual({ critAdd: 0, damageMult: 1, damageTakenMult: 1 });
  });

  it("adds critAdd from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "crit_eff", mods: { critAdd: 15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
    expect(mods.damageMult).toBe(1);
    expect(mods.damageTakenMult).toBe(1);
  });

  it("adds critAdd values from multiple effects (additive, not multiplicative)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "crit_a", mods: { critAdd: 10 } }));
    grantEffect(id, makeEffect({ id: "crit_b", mods: { critAdd: 5 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
  });

  it("curse critAdd is subtracted (negative value)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_crit", kind: "curse", mods: { critAdd: -10 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(-10);
  });

  it("multiplies damageMult from stacked effects (compound)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "dmg_a", mods: { damageMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "dmg_b", mods: { damageMult: 1.15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.damageMult).toBeCloseTo(1.1 * 1.15);
  });

  it("multiplies damageTakenMult from stacked effects (compound)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "dtr_a", mods: { damageTakenMult: 0.85 } }));
    grantEffect(id, makeEffect({ id: "dtr_b", mods: { damageTakenMult: 1.15 } }));
    const mods = getCombatModifiers(id);
    expect(mods.damageTakenMult).toBeCloseTo(0.85 * 1.15);
  });

  it("ignores xpMult and goldMult (not part of CombatModifiers)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_gold", mods: { xpMult: 1.5, goldMult: 1.2 } }));
    const mods = getCombatModifiers(id);
    expect(mods).toEqual({ critAdd: 0, damageMult: 1, damageTakenMult: 1 });
  });

  it("compound: all three combat mods from one multi-mod effect", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "combo", mods: { critAdd: 15, damageMult: 1.15, damageTakenMult: 0.85 } }));
    const mods = getCombatModifiers(id);
    expect(mods.critAdd).toBe(15);
    expect(mods.damageMult).toBeCloseTo(1.15);
    expect(mods.damageTakenMult).toBeCloseTo(0.85);
  });

  it("ignores expired effects (expiry is checked at read time)", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "expired", durationMs: 5_000, mods: { critAdd: 20 } }));
      vi.advanceTimersByTime(6_000);
      const mods = getCombatModifiers(id);
      expect(mods.critAdd).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("only counts non-expired effects when some have expired and some have not", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "short_crit", durationMs: 5_000, mods: { critAdd: 20 } }));
      grantEffect(id, makeEffect({ id: "long_dmg",  durationMs: 60_000, mods: { damageMult: 1.1 } }));
      vi.advanceTimersByTime(6_000);
      const mods = getCombatModifiers(id);
      expect(mods.critAdd).toBe(0);
      expect(mods.damageMult).toBeCloseTo(1.1);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── getRewardMultipliers ──────────────────────────────────────────────────────

describe("getRewardMultipliers", () => {
  it("returns neutral defaults when player has no effects", () => {
    const mult = getRewardMultipliers(uid());
    expect(mult).toEqual({ xpMult: 1, goldMult: 1 });
  });

  it("applies xpMult from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_eff", mods: { xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1);
    expect(mult.goldMult).toBe(1);
  });

  it("applies goldMult from a single blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "gold_eff", mods: { goldMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(1.1);
    expect(mult.xpMult).toBe(1);
  });

  it("compounds xpMult across multiple effects", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "xp_a", mods: { xpMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "xp_b", mods: { xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1 * 1.1);
  });

  it("compounds goldMult across multiple effects", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "gold_a", mods: { goldMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "gold_b", mods: { goldMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(1.1 * 0.9);
  });

  it("curse reduces goldMult below 1", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_gold", kind: "curse", mods: { goldMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.goldMult).toBeCloseTo(0.9);
  });

  it("curse reduces xpMult below 1", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "curse_xp", kind: "curse", mods: { xpMult: 0.9 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(0.9);
  });

  it("ignores critAdd, damageMult, damageTakenMult (not part of RewardMultipliers)", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "combat_only", mods: { critAdd: 15, damageMult: 1.5, damageTakenMult: 0.5 } }));
    const mult = getRewardMultipliers(id);
    expect(mult).toEqual({ xpMult: 1, goldMult: 1 });
  });

  it("ignores expired effects", () => {
    vi.useFakeTimers();
    try {
      const id = uid();
      grantEffect(id, makeEffect({ id: "expired_xp", durationMs: 5_000, mods: { xpMult: 2.0 } }));
      vi.advanceTimersByTime(6_000);
      const mult = getRewardMultipliers(id);
      expect(mult.xpMult).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cenusa_vie blessing stacks both xpMult and damageMult (only xpMult visible in reward)", () => {
    const id = uid();
    // cenusa_vie: damageMult: 1.15, xpMult: 1.1
    grantEffect(id, makeEffect({ id: "cenusa_vie", mods: { damageMult: 1.15, xpMult: 1.1 } }));
    const mult = getRewardMultipliers(id);
    expect(mult.xpMult).toBeCloseTo(1.1);
    expect(mult.goldMult).toBe(1);
  });
});

describe("guild boost restoration", () => {
  afterEach(() => {
    clearGuildBoost("test-guild");
    vi.useRealTimers();
  });

  it("restores an active boost using its persisted absolute expiry", () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 60_000;
    clearGuildBoost("test-guild");

    expect(restoreGuildBoost("test-guild", 1.25, 1, expiresAt)).toEqual({
      xpMult: 1.25,
      goldMult: 1,
      expiresAt,
    });
    expect(getGuildBoost("test-guild")).toEqual({
      xpMult: 1.25,
      goldMult: 1,
      expiresAt,
    });

    vi.advanceTimersByTime(60_001);
    expect(getGuildBoost("test-guild")).toBeNull();
  });

  it("replaces the previous guild boost when a new decree is granted", () => {
    const oldBoost = grantGuildBoost("test-guild", 1.25, 1, 60_000);
    const newBoost = grantGuildBoost("test-guild", 1, 1.25, 60_000);

    expect(getGuildBoost("test-guild")).toEqual(newBoost);
    expect(getGuildBoost("test-guild")).not.toEqual(oldBoost);
  });
});

// ─── rollChestEffectKind ───────────────────────────────────────────────────────

describe("rollChestEffectKind", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function mockRolls(...values: number[]) {
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => values[Math.min(i++, values.length - 1)]!);
  }

  it("returns null for unknown rarity", () => {
    expect(rollChestEffectKind("necunoscut")).toBeNull();
    expect(rollChestEffectKind("necunoscut", true)).toBeNull();
  });

  it("returns null when the chance roll fails", () => {
    mockRolls(0.99);
    expect(rollChestEffectKind("bronz")).toBeNull();
  });

  it("returns blessing when chance passes and share roll is low", () => {
    mockRolls(0.0, 0.0);
    expect(rollChestEffectKind("bronz")).toBe("blessing");
  });

  it("returns curse when chance passes but share roll is high", () => {
    mockRolls(0.0, 0.99);
    expect(rollChestEffectKind("bronz")).toBe("curse");
  });

  it("regal free chest never curses (blessingShare = 1)", () => {
    mockRolls(0.0, 0.999999);
    expect(rollChestEffectKind("regal")).toBe("blessing");
  });

  it("locked chests never curse for any rarity", () => {
    for (const rarity of Object.keys(LOCKED_CHEST_EFFECT_ODDS)) {
      mockRolls(0.0, 0.999999);
      expect(rollChestEffectKind(rarity, true)).toBe("blessing");
      vi.restoreAllMocks();
    }
  });

  it("locked regal chest guarantees a blessing (chance = 1)", () => {
    mockRolls(0.999999, 0.0);
    expect(rollChestEffectKind("regal", true)).toBe("blessing");
  });

  it("locked lookup does not fall back to free-chest odds (bronz has no locked entry)", () => {
    mockRolls(0.0, 0.0);
    expect(rollChestEffectKind("bronz", true)).toBeNull();
  });

  it("free-chest odds increase with rarity", () => {
    const order = ["bronz", "argint", "aur", "mitic", "regal"];
    for (let i = 1; i < order.length; i++) {
      const prev = CHEST_EFFECT_ODDS[order[i - 1]!]!;
      const cur = CHEST_EFFECT_ODDS[order[i]!]!;
      expect(cur.chance).toBeGreaterThan(prev.chance);
      expect(cur.blessingShare).toBeGreaterThanOrEqual(prev.blessingShare);
    }
  });
});

// ─── buildChestEffectMessage ───────────────────────────────────────────────────

describe("buildChestEffectMessage", () => {
  it("blessing message includes username, label, flavor, and duration", () => {
    const def = makeEffect({ id: "msg_bless", label: "Lumina Cenușii", flavor: "+10% XP în luptă", durationMs: 10 * 60 * 1000 });
    const msg = buildChestEffectMessage("Tester", def);
    expect(msg).toContain("Tester");
    expect(msg).toContain("Lumina Cenușii");
    expect(msg).toContain("+10% XP în luptă");
    expect(msg).toContain("10 minute");
    expect(msg).toContain("binecuvântarea");
  });

  it("curse message uses the curse framing", () => {
    const def = makeEffect({ id: "msg_curse", kind: "curse", label: "Umbra Șchioapă", flavor: "-10% daune în luptă", durationMs: 8 * 60 * 1000 });
    const msg = buildChestEffectMessage("Tester", def);
    expect(msg).toContain("blestemul");
    expect(msg).toContain("Umbra Șchioapă");
    expect(msg).toContain("8 minute");
  });

  it("duration is floored to at least 1 minute (singular form)", () => {
    const def = makeEffect({ id: "msg_short", durationMs: 10_000 });
    const msg = buildChestEffectMessage("Tester", def);
    expect(msg).toContain("1 minut");
    expect(msg).not.toContain("1 minute");
  });
});

// ─── describeEffectMods ────────────────────────────────────────────────────────

describe("describeEffectMods", () => {
  it("shows +% for boosting multipliers", () => {
    expect(describeEffectMods({ damageMult: 1.15 })).toBe("+15% daune");
    expect(describeEffectMods({ xpMult: 1.1 })).toBe("+10% XP");
    expect(describeEffectMods({ goldMult: 1.1 })).toBe("+10% Oboli");
  });

  it("shows -% for reducing multipliers", () => {
    expect(describeEffectMods({ damageMult: 0.9 })).toBe("-10% daune");
    expect(describeEffectMods({ xpMult: 0.9 })).toBe("-10% XP");
    expect(describeEffectMods({ goldMult: 0.9 })).toBe("-10% Oboli");
  });

  it("formats critAdd with explicit sign", () => {
    expect(describeEffectMods({ critAdd: 15 })).toBe("+15% șansă critică");
    expect(describeEffectMods({ critAdd: -10 })).toBe("-10% șansă critică");
  });

  it("damageTakenMult below 1 shows as fewer damage taken, above 1 as more", () => {
    expect(describeEffectMods({ damageTakenMult: 0.85 })).toBe("-15% daune primite");
    expect(describeEffectMods({ damageTakenMult: 1.15 })).toBe("+15% daune primite");
  });

  it("joins multiple mods with commas", () => {
    expect(describeEffectMods({ damageMult: 1.15, xpMult: 1.1 })).toBe("+15% daune, +10% XP");
  });

  it("returns empty string for neutral/empty mods", () => {
    expect(describeEffectMods({})).toBe("");
    expect(describeEffectMods({ damageMult: 1, xpMult: 1, goldMult: 1, damageTakenMult: 1, critAdd: 0 })).toBe("");
  });
});

// ─── formatCombatEffects ───────────────────────────────────────────────────────

describe("formatCombatEffects", () => {
  it("returns empty string when player has no effects", () => {
    expect(formatCombatEffects(uid())).toBe("");
  });

  it("shows green dot + explicit bonus for a blessing", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "fmt_bless", label: "Lumina Cenușii", emoji: "✨", mods: { xpMult: 1.1 } }));
    const txt = formatCombatEffects(id);
    expect(txt).toContain("🟢");
    expect(txt).toContain("Lumina Cenușii");
    expect(txt).toContain("+10% XP");
    expect(txt).toMatch(/\(\d+m\)/);
  });

  it("shows red dot + explicit penalty for a curse", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "fmt_curse", kind: "curse", label: "Umbra Șchioapă", emoji: "🦶", mods: { damageMult: 0.9 } }));
    const txt = formatCombatEffects(id);
    expect(txt).toContain("🔴");
    expect(txt).toContain("Umbra Șchioapă");
    expect(txt).toContain("-10% daune");
  });

  it("lists blessing and curse together on separate lines", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "fmt_b2", mods: { goldMult: 1.1 } }));
    grantEffect(id, makeEffect({ id: "fmt_c2", kind: "curse", mods: { critAdd: -10 } }));
    const lines = formatCombatEffects(id).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("🟢");
    expect(lines[1]).toContain("🔴");
  });

  it("falls back to flavor text when mods are empty", () => {
    const id = uid();
    grantEffect(id, makeEffect({ id: "fmt_flavor", flavor: "efect misterios", mods: {} }));
    expect(formatCombatEffects(id)).toContain("efect misterios");
  });
});
