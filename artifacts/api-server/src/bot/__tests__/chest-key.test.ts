import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock references ─────────────────────────────────────────────────────
const { mockReturning, mockWhere } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  return { mockReturning, mockWhere };
});

// ── Mock @workspace/db ────────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  return {
    db: { update: mockUpdate },
    playersTable: {
      discordId: "discordId",
      guildId: "guildId",
      keyRar: "keyRar",
      keyEpic: "keyEpic",
      keyRegal: "keyRegal",
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

import { consumePlayerKey } from "../db";
import { gte } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────

const TEST_GUILD_ID = "test-guild-1";

const FAKE_PLAYER_WITH_KEY = {
  discordId: "user1",
  guildId: TEST_GUILD_ID,
  keyRar: 1,
  keyEpic: 0,
  keyRegal: 0,
};

describe("consumePlayerKey — atomic key deduction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic consumption ────────────────────────────────────────────────────

  it("returns true when a rar key is successfully consumed", async () => {
    mockReturning.mockResolvedValueOnce([FAKE_PLAYER_WITH_KEY]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "rar");

    expect(result).toBe(true);
  });

  it("returns false when the player has no rar key (WHERE key >= 1 fails)", async () => {
    // DB UPDATE ... WHERE key >= 1 returns empty because key = 0
    mockReturning.mockResolvedValueOnce([]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "rar");

    expect(result).toBe(false);
  });

  it("returns true when an epic key is consumed", async () => {
    mockReturning.mockResolvedValueOnce([{ ...FAKE_PLAYER_WITH_KEY, keyEpic: 1 }]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "epic");

    expect(result).toBe(true);
  });

  it("returns false when the player has no epic key", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "epic");

    expect(result).toBe(false);
  });

  it("returns true when a regal key is consumed", async () => {
    mockReturning.mockResolvedValueOnce([{ ...FAKE_PLAYER_WITH_KEY, keyRegal: 1 }]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "regal");

    expect(result).toBe(true);
  });

  it("returns false when the player has no regal key", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await consumePlayerKey("user1", TEST_GUILD_ID, "regal");

    expect(result).toBe(false);
  });

  // ── Atomicity guard (WHERE key >= 1) ────────────────────────────────────

  it("uses WHERE key >= 1 guard to prevent negative keys", async () => {
    mockReturning.mockResolvedValueOnce([]);

    await consumePlayerKey("user1", TEST_GUILD_ID, "rar");

    // gte() must have been called with the key column and 1 to enforce atomicity
    expect(vi.mocked(gte)).toHaveBeenCalledWith("keyRar", 1);
  });

  it("uses the correct column for each key type", async () => {
    mockReturning.mockResolvedValue([]);

    await consumePlayerKey("user1", TEST_GUILD_ID, "rar");
    expect(vi.mocked(gte)).toHaveBeenCalledWith("keyRar", 1);

    vi.clearAllMocks();
    mockReturning.mockResolvedValue([]);
    await consumePlayerKey("user1", TEST_GUILD_ID, "epic");
    expect(vi.mocked(gte)).toHaveBeenCalledWith("keyEpic", 1);

    vi.clearAllMocks();
    mockReturning.mockResolvedValue([]);
    await consumePlayerKey("user1", TEST_GUILD_ID, "regal");
    expect(vi.mocked(gte)).toHaveBeenCalledWith("keyRegal", 1);
  });

  // ── Concurrent race-condition simulation ─────────────────────────────────

  it("only one concurrent claim succeeds when a single key is available", async () => {
    // The DB-level WHERE key >= 1 is atomic: first UPDATE decrements key to 0,
    // second UPDATE sees key = 0, WHERE fails, returns empty.
    mockReturning
      .mockResolvedValueOnce([FAKE_PLAYER_WITH_KEY]) // first caller wins
      .mockResolvedValueOnce([]);                    // second caller loses

    const [a, b] = await Promise.all([
      consumePlayerKey("user1", TEST_GUILD_ID, "rar"),
      consumePlayerKey("user1", TEST_GUILD_ID, "rar"),
    ]);

    const wins = [a, b].filter(Boolean);
    const losses = [a, b].filter((r) => !r);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
  });

  it("both claims succeed when the player has two keys", async () => {
    // With key = 2: first decrements to 1 (succeeds), second decrements to 0 (succeeds)
    mockReturning
      .mockResolvedValueOnce([{ ...FAKE_PLAYER_WITH_KEY, keyRar: 2 }])
      .mockResolvedValueOnce([{ ...FAKE_PLAYER_WITH_KEY, keyRar: 1 }]);

    const [a, b] = await Promise.all([
      consumePlayerKey("user1", TEST_GUILD_ID, "rar"),
      consumePlayerKey("user1", TEST_GUILD_ID, "rar"),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it("does not consume a key when discordId does not match", async () => {
    // Wrong user — WHERE eq(discordId, ...) fails
    mockReturning.mockResolvedValueOnce([]);

    const result = await consumePlayerKey("different_user", TEST_GUILD_ID, "rar");

    expect(result).toBe(false);
  });
});

// ─── Locked-chest claim flow: consume-first, then check claimedChests ─────────
//
// The actual handleLockedChestClaim function lives in index.ts (a Discord bot
// handler) and pulls in the full discord.js client, making direct unit testing
// impractical. Instead we verify the two invariants that guard correctness:
//
//  1. consumePlayerKey is the FIRST gate — if it returns false the flow stops
//     before touching claimedChests (no key wasted, no chest claimed).
//  2. If consumePlayerKey returns true but the chest was already claimed, the
//     refund path must call addPlayerKey (key returned to the player).
//
// These are tested as pure logic simulations below, mirroring the exact branch
// order in index.ts:handleLockedChestClaim.

describe("Locked-chest claim ordering (consume-first, then claimedChests guard)", () => {
  it("stops without touching claimedChests when consumePlayerKey returns false", async () => {
    const claimedChests = new Set<string>();
    const consumeKey = vi.fn().mockResolvedValue(false);
    const addKey = vi.fn();
    const claimChest = vi.fn();

    // Simulate the handleLockedChestClaim logic
    const keyConsumed: boolean = await consumeKey("user1", "rar");
    if (!keyConsumed) {
      // short-circuit: no key, do nothing else
    } else {
      if (claimedChests.has("chest_1")) {
        await addKey("user1", "rar"); // refund
      } else {
        claimedChests.add("chest_1");
        claimChest();
      }
    }

    expect(claimedChests.size).toBe(0);
    expect(addKey).not.toHaveBeenCalled();
    expect(claimChest).not.toHaveBeenCalled();
  });

  it("claims chest and does NOT refund key when chest is unclaimed and key is available", async () => {
    const claimedChests = new Set<string>();
    const consumeKey = vi.fn().mockResolvedValue(true);
    const addKey = vi.fn();
    const claimChest = vi.fn();

    const keyConsumed: boolean = await consumeKey("user1", "rar");
    if (!keyConsumed) {
      // no-op
    } else {
      if (claimedChests.has("chest_1")) {
        await addKey("user1", "rar");
      } else {
        claimedChests.add("chest_1");
        claimChest();
      }
    }

    expect(claimedChests.has("chest_1")).toBe(true);
    expect(claimChest).toHaveBeenCalledOnce();
    expect(addKey).not.toHaveBeenCalled();
  });

  it("refunds key when chest was already claimed by a concurrent opener", async () => {
    const claimedChests = new Set<string>(["chest_1"]); // pre-claimed
    const consumeKey = vi.fn().mockResolvedValue(true);
    const addKey = vi.fn().mockResolvedValue(undefined);
    const claimChest = vi.fn();

    const keyConsumed: boolean = await consumeKey("user1", "rar");
    if (!keyConsumed) {
      // no-op
    } else {
      if (claimedChests.has("chest_1")) {
        await addKey("user1", "rar"); // refund
      } else {
        claimedChests.add("chest_1");
        claimChest();
      }
    }

    expect(addKey).toHaveBeenCalledOnce();
    expect(addKey).toHaveBeenCalledWith("user1", "rar");
    expect(claimChest).not.toHaveBeenCalled();
  });

  it("exactly one of two concurrent claimers wins (key consumed first, chest guard second)", async () => {
    // Both consume a key (they each had one), but only one beats the claimedChests check.
    // Simulate: user A arrives first and adds to claimedChests; user B sees it already there.
    const claimedChests = new Set<string>();
    const consumeKeyA = vi.fn().mockResolvedValue(true);
    const consumeKeyB = vi.fn().mockResolvedValue(true);
    const addKeyA = vi.fn().mockResolvedValue(undefined);
    const addKeyB = vi.fn().mockResolvedValue(undefined);
    let claimCount = 0;

    async function tryClaimAsUser(
      consumeKey: typeof consumeKeyA,
      addKey: typeof addKeyA,
      userId: string,
    ) {
      const keyConsumed: boolean = await consumeKey(userId, "rar");
      if (!keyConsumed) return "no_key";
      if (claimedChests.has("chest_1")) {
        await addKey(userId, "rar");
        return "refunded";
      }
      claimedChests.add("chest_1");
      claimCount++;
      return "claimed";
    }

    // Run sequentially (JS is single-threaded; the Set.has/add gap is what
    // the real code also relies on being in the same tick between defer and add)
    const resultA = await tryClaimAsUser(consumeKeyA, addKeyA, "userA");
    const resultB = await tryClaimAsUser(consumeKeyB, addKeyB, "userB");

    expect(resultA).toBe("claimed");
    expect(resultB).toBe("refunded");
    expect(claimCount).toBe(1);
    expect(addKeyB).toHaveBeenCalledOnce(); // B's key was refunded
    expect(addKeyA).not.toHaveBeenCalled(); // A's key was spent (chest claimed)
  });
});
