import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock references ─────────────────────────────────────────────────────
const { mockReturning, mockWhere } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  return { mockReturning, mockWhere };
});

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  const mockUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: mockWhere })) }));
  return {
    db: { update: mockUpdate },
    playersTable: {
      discordId: "discordId",
      guildId: "guildId",
      companion: "companion",
      companionLevel: "companionLevel",
      gold: "gold",
      xp: "xp",
      abilityEmpowerLevel: "abilityEmpowerLevel",
      abilityShieldLevel: "abilityShieldLevel",
      attackBonus: "attackBonus",
      defenseBonus: "defenseBonus",
      dodgeBonus: "dodgeBonus",
      critBonus: "critBonus",
      maxHpBonus: "maxHpBonus",
      shopAttackCount: "shopAttackCount",
      shopDefenseCount: "shopDefenseCount",
      shopDodgeCount: "shopDodgeCount",
      shopCritCount: "shopCritCount",
      shopHpCount: "shopHpCount",
      keyRar: "keyRar",
      keyEpic: "keyEpic",
      keyRegal: "keyRegal",
    },
    activeEventsTable: {},
    eventParticipantsTable: {},
    eventClaimsTable: {},
    botStateTable: {},
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => `eq(${String(col)},${String(val)})`),
  and: vi.fn((...args: unknown[]) => `and(${args.join(",")})`),
  gte: vi.fn((col: unknown, val: unknown) => `gte(${String(col)},${String(val)})`),
  gt: vi.fn(() => "gt-placeholder"),
  inArray: vi.fn(() => "inArray-placeholder"),
  sql: Object.assign(vi.fn((s: unknown) => `sql(${String(s)})`), { empty: "" }),
}));

// ── Mock ../survival ──────────────────────────────────────────────────────────
vi.mock("../survival", () => ({
  CLASSES: {},
  isClassKey: vi.fn(() => false),
  rollRarity: vi.fn(() => "comun"),
  isCompanionKey: vi.fn(() => true),
  companionStats: vi.fn(() => ({ hp: 0, attack: 0, defense: 0, crit: 0 })),
  UPGRADE_DELTA: { atac: 2, def: 2, dodge: 3, crit: 2, hp: 10 },
}));

import { upgradeCompanion, upgradeAbility } from "../db";

// ─────────────────────────────────────────────────────────────────────────────

const TEST_GUILD_ID = "test-guild-1";

const FAKE_PLAYER = {
  discordId: "user1",
  guildId: TEST_GUILD_ID,
  username: "Tester",
  companion: "lup",
  companionLevel: 2,
  gold: 1000,
  xp: 500,
  class: null,
  attackBonus: 0,
  defenseBonus: 0,
  dodgeBonus: 0,
  critBonus: 0,
  maxHpBonus: 0,
  shopAttackCount: 0,
  shopDefenseCount: 0,
  shopDodgeCount: 0,
  shopCritCount: 0,
  shopHpCount: 0,
  keyRar: 0,
  keyEpic: 0,
  keyRegal: 0,
  deaths: 0,
  deathLevel: 0,
  retreats: 0,
  retreatLevel: 0,
  maxLevel: 1,
  reputation: 0,
  honorTitle: null,
  abilityEmpowerLevel: 1,
  abilityShieldLevel: 0,
  hp: 100,
  createdAt: new Date(),
};

// ─── upgradeCompanion ─────────────────────────────────────────────────────────

describe("upgradeCompanion — escalating expectedLevel guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the updated player when WHERE expectedLevel matches DB level", async () => {
    mockReturning.mockResolvedValueOnce([{ ...FAKE_PLAYER, companionLevel: 3 }]);

    const result = await upgradeCompanion("user1", TEST_GUILD_ID, 2, 230, 100);

    expect(result).not.toBeNull();
    expect(result?.companionLevel).toBe(3);
    expect(mockWhere).toHaveBeenCalledOnce();
  });

  it("returns null when expectedLevel does NOT match (concurrent click, stale level)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await upgradeCompanion("user1", TEST_GUILD_ID, 1, 200, 100);

    expect(result).toBeNull();
  });

  it("returns null when gold is insufficient (WHERE gte(gold, cost) fails)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await upgradeCompanion("user1", TEST_GUILD_ID, 2, 99999, 100);

    expect(result).toBeNull();
  });

  it("prevents double-upgrade: second concurrent click at same level returns null", async () => {
    mockReturning
      .mockResolvedValueOnce([{ ...FAKE_PLAYER, companionLevel: 3 }])
      .mockResolvedValueOnce([]);

    const [first, second] = await Promise.all([
      upgradeCompanion("user1", TEST_GUILD_ID, 2, 230, 100),
      upgradeCompanion("user1", TEST_GUILD_ID, 2, 230, 100),
    ]);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("passes expectedLevel into the WHERE clause (not just player id)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await upgradeCompanion("user1", TEST_GUILD_ID, 7, 500, 100);

    const { eq } = await import("drizzle-orm");
    const calls = vi.mocked(eq).mock.calls;
    const hasExpectedLevelGuard = calls.some(([col, val]) => String(col) === "companionLevel" && val === 7);
    expect(hasExpectedLevelGuard).toBe(true);
  });
});

// ─── upgradeAbility ───────────────────────────────────────────────────────────

describe("upgradeAbility — escalating expectedLevel guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns updated player when expectedLevel matches for empower", async () => {
    mockReturning.mockResolvedValueOnce([{ ...FAKE_PLAYER, abilityEmpowerLevel: 2 }]);

    const result = await upgradeAbility("user1", TEST_GUILD_ID, "empower", 1, 230, 100);

    expect(result).not.toBeNull();
    expect(result?.abilityEmpowerLevel).toBe(2);
  });

  it("returns updated player when expectedLevel matches for shield", async () => {
    mockReturning.mockResolvedValueOnce([{ ...FAKE_PLAYER, abilityShieldLevel: 2 }]);

    const result = await upgradeAbility("user1", TEST_GUILD_ID, "shield", 1, 230, 100);

    expect(result).not.toBeNull();
    expect(result?.abilityShieldLevel).toBe(2);
  });

  it("returns null when expectedLevel does NOT match (concurrent click already advanced it)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await upgradeAbility("user1", TEST_GUILD_ID, "empower", 1, 230, 100);

    expect(result).toBeNull();
  });

  it("prevents double-upgrade: second concurrent click at same level returns null", async () => {
    mockReturning
      .mockResolvedValueOnce([{ ...FAKE_PLAYER, abilityEmpowerLevel: 2 }])
      .mockResolvedValueOnce([]);

    const [first, second] = await Promise.all([
      upgradeAbility("user1", TEST_GUILD_ID, "empower", 1, 230, 100),
      upgradeAbility("user1", TEST_GUILD_ID, "empower", 1, 230, 100),
    ]);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("passes the expectedLevel into the WHERE clause", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await upgradeAbility("user1", TEST_GUILD_ID, "empower", 5, 500, 100);

    const { eq } = await import("drizzle-orm");
    const calls = vi.mocked(eq).mock.calls;
    const hasGuard = calls.some(([, val]) => val === 5);
    expect(hasGuard).toBe(true);
  });

  it("returns null if level is below 1 (ability not yet owned)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await upgradeAbility("user1", TEST_GUILD_ID, "empower", 0, 230, 100);

    expect(result).toBeNull();
  });
});
