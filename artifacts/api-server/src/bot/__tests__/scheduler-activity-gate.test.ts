import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock deps so we can import from scheduler without a real Discord client ──
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../channel-config", () => ({
  getChannel: vi.fn().mockReturnValue(null),
  initChannelConfig: vi.fn(),
  hasAnyChannelConfigured: vi.fn().mockReturnValue(false),
}));
const { mockSpawnSeasonalChest } = vi.hoisted(() => ({
  mockSpawnSeasonalChest: vi.fn().mockResolvedValue(null),
}));
vi.mock("../chest-expansions", () => ({
  openFratiaVote: vi.fn(),
  rehydrateFratiaVote: vi.fn(),
  spawnSeasonalChest: mockSpawnSeasonalChest,
  rehydrateSeasonalChest: vi.fn(),
  settleExpiredAuction: vi.fn(),
}));
vi.mock("../oracle", () => ({
  startOracle: vi.fn(),
  setOracleExtatic: vi.fn(),
  recordMessage: vi.fn(),
}));
vi.mock("../db", () => ({
  createEvent: vi.fn(),
  deactivateEvent: vi.fn(),
  getExpiredActiveEvents: vi.fn().mockResolvedValue([]),
  getEventParticipants: vi.fn().mockResolvedValue([]),
  getAllEvents: vi.fn().mockResolvedValue([]),
  setEventDecreeMessage: vi.fn(),
  deleteEvent: vi.fn(),
  getLatestActiveEvent: vi.fn().mockResolvedValue(null),
  getActiveEvent: vi.fn().mockResolvedValue(null),
  setHonorTitle: vi.fn(),
  addPlayerReputation: vi.fn(),
  addPlayerGold: vi.fn(),
  addPlayerXp: vi.fn(),
  getPrestigeLevels: vi.fn().mockResolvedValue([]),
  persistActiveBoss: vi.fn(),
  loadActiveBossRowsByGuild: vi.fn().mockResolvedValue([]),
  deleteActiveBoss: vi.fn(),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
  persistActiveChest: vi.fn(),
  loadActiveChest: vi.fn().mockResolvedValue(null),
  clearActiveChest: vi.fn(),
  KEYCHEST_DBKEY: "keychest",
  LOCKCHEST_DBKEY: "lockchest",
  runMultiGuildMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../survival", () => ({
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "bronz", emoji: "🥉" }, gold: 50 }),
  rollKeyChestType: vi.fn().mockReturnValue("rar"),
  oracleMessage: vi.fn().mockReturnValue(""),
  buildChestEmbed: vi.fn().mockReturnValue({}),
  buildExpiredChestEmbed: vi.fn().mockReturnValue({}),
  buildStartEmbed: vi.fn().mockReturnValue({}),
  buildExpiredCronica: vi.fn().mockReturnValue({}),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue({}),
  buildEventLeaderboard: vi.fn().mockReturnValue({}),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyChestEmbed: vi.fn().mockReturnValue({}),
  spawnLockedChest: vi.fn().mockReturnValue({ chestId: "lc_1", gold: 100, rarityKey: "argint" }),
  computeBossRewards: vi.fn().mockReturnValue([]),
  prestigeGoldMult: vi.fn().mockReturnValue(1),
  finalBossRow: vi.fn().mockReturnValue({}),
  bossMaxHp: vi.fn().mockReturnValue(1000),
  CHEST_RARITIES: [],
}));
vi.mock("../combat-events", () => ({
  triggerRandomBattleEvent: vi.fn(),
}));
vi.mock("../status-effects", () => ({
  getRewardMultipliers: vi.fn().mockReturnValue({ xpMult: 1, goldMult: 1 }),
}));

import { isGuildActive, recordGuildActivity, rollActivityRarityKey, rollActivityKeyType, guildStates, CHEST_MSG_MILESTONE, KEY_CHEST_MSG_MILESTONE, SEASONAL_CHEST_MSG_MILESTONE, ACTIVITY_WINDOW_MINUTES, CHEST_EXPIRE_MS, EVENT_MESSAGE_RETENTION_MS } from "../scheduler";

// ─────────────────────────────────────────────────────────────────────────────

describe("isGuildActive — pure activity gate helper", () => {
  const WINDOW = 20 * 60 * 1000; // 20 min

  it("returns false when lastActivityAt is 0 (never seen)", () => {
    expect(isGuildActive(0, WINDOW)).toBe(false);
  });

  it("returns true when activity is within the window", () => {
    const now = Date.now();
    expect(isGuildActive(now - 5 * 60_000, WINDOW, now)).toBe(true);
  });

  it("returns true exactly at the window boundary", () => {
    const now = Date.now();
    expect(isGuildActive(now - WINDOW, WINDOW, now)).toBe(true);
  });

  it("returns false when activity is beyond the window", () => {
    const now = Date.now();
    expect(isGuildActive(now - WINDOW - 1, WINDOW, now)).toBe(false);
  });

  it("returns false when lastActivityAt is far in the past", () => {
    const now = Date.now();
    expect(isGuildActive(now - 2 * 60 * 60_000, WINDOW, now)).toBe(false);
  });
});

describe("event and chest message retention", () => {
  it("keeps unclaimed chests and ended event recaps for twenty minutes", () => {
    expect(CHEST_EXPIRE_MS).toBe(20 * 60 * 1000);
    expect(EVENT_MESSAGE_RETENTION_MS).toBe(20 * 60 * 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("recordGuildActivity — per-guild counter and gate", () => {
  const GUILD = "test-guild-activity";
  const mockClient = {} as never;

  beforeEach(() => {
    guildStates.delete(GUILD);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sets lastActivityAt when called", () => {
    const before = Date.now();
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    expect(gs.lastActivityAt).toBeGreaterThanOrEqual(before);
  });

  it("increments activityMsgCount on each call", () => {
    recordGuildActivity(mockClient, GUILD);
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    expect(gs.activityMsgCount).toBe(2);
  });

  it("resets activityMsgCount to 0 after reaching the milestone", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    gs.activityMsgCount = CHEST_MSG_MILESTONE - 1;
    recordGuildActivity(mockClient, GUILD);
    expect(gs.activityMsgCount).toBe(0);
  });

  it("does NOT trigger a bonus chest when milestone not yet reached", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    // Set count 2 below milestone — even two calls shouldn't trigger
    gs.activityMsgCount = CHEST_MSG_MILESTONE - 2;
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.01); // would always trigger if milestone hit
    recordGuildActivity(mockClient, GUILD);
    // Not yet at milestone — count should be CHEST_MSG_MILESTONE - 1
    expect(gs.activityMsgCount).toBe(CHEST_MSG_MILESTONE - 1);
    spy.mockRestore();
  });

  it("triggers one seasonal chest after exactly ten main-channel messages", async () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    gs.seasonalMsgCount = SEASONAL_CHEST_MSG_MILESTONE - 1;

    recordGuildActivity(mockClient, GUILD);
    await Promise.resolve();

    expect(gs.seasonalMsgCount).toBe(0);
    expect(mockSpawnSeasonalChest).toHaveBeenCalledOnce();
    expect(mockSpawnSeasonalChest).toHaveBeenCalledWith(mockClient, GUILD);
  });

  it("does NOT trigger a chest when guild scheduler is stopped", () => {
    const gs = guildStates.get(GUILD) ?? (() => {
      recordGuildActivity(mockClient, GUILD);
      return guildStates.get(GUILD)!;
    })();
    gs.stopped = true;
    const before = gs.lastActivityAt;
    recordGuildActivity(mockClient, GUILD);
    // Should return early — state unchanged
    expect(gs.lastActivityAt).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rollActivityRarityKey — biased rarity for activity bonus chests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'bronz' when Math.random() is below 0.70 threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.00);
    expect(rollActivityRarityKey()).toBe("bronz");
  });

  it("returns 'bronz' at the upper edge of the 70% band (r=69.99)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.6999);
    expect(rollActivityRarityKey()).toBe("bronz");
  });

  it("returns 'argint' in the 70%–95% band", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.80);
    expect(rollActivityRarityKey()).toBe("argint");
  });

  it("returns 'aur' above the 95% threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(rollActivityRarityKey()).toBe("aur");
  });

  it("never returns 'mitic' or 'regal' regardless of Math.random()", () => {
    const SAMPLES = 200;
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => idx++ / SAMPLES);
    const results = Array.from({ length: SAMPLES }, rollActivityRarityKey);
    expect(results.every(r => r !== "mitic" && r !== "regal")).toBe(true);
  });

  it("produces roughly 70% bronz, 25% argint, 5% aur over many rolls", () => {
    const SAMPLES = 10_000;
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (idx++ % SAMPLES) / SAMPLES);
    const counts: Record<string, number> = { bronz: 0, argint: 0, aur: 0 };
    for (let i = 0; i < SAMPLES; i++) counts[rollActivityRarityKey()]!++;
    expect(counts["bronz"]! / SAMPLES).toBeCloseTo(0.70, 1);
    expect(counts["argint"]! / SAMPLES).toBeCloseTo(0.25, 1);
    expect(counts["aur"]! / SAMPLES).toBeCloseTo(0.05, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("rollActivityKeyType — biased key type for activity bonus key chests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'rar' when Math.random() is below 0.60", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.00);
    expect(rollActivityKeyType()).toBe("rar");
  });

  it("returns 'rar' at the upper edge of the 60% band (0.5999)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5999);
    expect(rollActivityKeyType()).toBe("rar");
  });

  it("returns 'epic' at or above the 0.60 threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.60);
    expect(rollActivityKeyType()).toBe("epic");
  });

  it("only ever returns 'rar' or 'epic', never other key types", () => {
    const SAMPLES = 200;
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => idx++ / SAMPLES);
    const results = Array.from({ length: SAMPLES }, rollActivityKeyType);
    expect(results.every(r => r === "rar" || r === "epic")).toBe(true);
  });

  it("produces roughly 60% rar and 40% epic over many rolls", () => {
    const SAMPLES = 10_000;
    let idx = 0;
    vi.spyOn(Math, "random").mockImplementation(() => (idx++ % SAMPLES) / SAMPLES);
    let rar = 0, epic = 0;
    for (let i = 0; i < SAMPLES; i++) {
      if (rollActivityKeyType() === "rar") rar++; else epic++;
    }
    expect(rar / SAMPLES).toBeCloseTo(0.60, 1);
    expect(epic / SAMPLES).toBeCloseTo(0.40, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("recordGuildActivity — key-chest milestone (keyMsgCount)", () => {
  const GUILD = "test-guild-key-milestone";
  const mockClient = {} as never;

  beforeEach(() => {
    guildStates.delete(GUILD);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("initialises keyMsgCount to 0 on first call", () => {
    recordGuildActivity(mockClient, GUILD);
    expect(guildStates.get(GUILD)!.keyMsgCount).toBe(1);
  });

  it("increments keyMsgCount independently of activityMsgCount", () => {
    for (let i = 0; i < 3; i++) recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    expect(gs.keyMsgCount).toBe(3);
    expect(gs.activityMsgCount).toBe(3);
  });

  it("resets keyMsgCount to 0 after reaching KEY_CHEST_MSG_MILESTONE", () => {
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    gs.keyMsgCount = KEY_CHEST_MSG_MILESTONE - 1;
    recordGuildActivity(mockClient, GUILD);
    expect(gs.keyMsgCount).toBe(0);
  });

  it("does NOT reset keyMsgCount when chest milestone fires but key milestone is not reached", () => {
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    // Put chest at milestone-1, key well below its milestone
    gs.activityMsgCount = CHEST_MSG_MILESTONE - 1;
    gs.keyMsgCount = 5;
    recordGuildActivity(mockClient, GUILD);
    // Chest resets, key counter just increments
    expect(gs.activityMsgCount).toBe(0);
    expect(gs.keyMsgCount).toBe(6);
  });

  it("does NOT trigger key chest when stopped", () => {
    recordGuildActivity(mockClient, GUILD);
    const gs = guildStates.get(GUILD)!;
    gs.stopped = true;
    const before = gs.keyMsgCount;
    recordGuildActivity(mockClient, GUILD);
    expect(gs.keyMsgCount).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("env var defaults", () => {
  it("ACTIVITY_WINDOW_MINUTES defaults to 20 or is a valid positive integer", () => {
    expect(ACTIVITY_WINDOW_MINUTES).toBeGreaterThan(0);
    expect(ACTIVITY_WINDOW_MINUTES).toBeLessThanOrEqual(120);
  });

  it("CHEST_MSG_MILESTONE defaults to 25 or is a valid positive integer", () => {
    expect(CHEST_MSG_MILESTONE).toBeGreaterThan(0);
    expect(CHEST_MSG_MILESTONE).toBeLessThanOrEqual(200);
  });

  it("KEY_CHEST_MSG_MILESTONE defaults to 50 or is a valid positive integer", () => {
    expect(KEY_CHEST_MSG_MILESTONE).toBeGreaterThan(0);
    expect(KEY_CHEST_MSG_MILESTONE).toBeLessThanOrEqual(400);
  });
});
