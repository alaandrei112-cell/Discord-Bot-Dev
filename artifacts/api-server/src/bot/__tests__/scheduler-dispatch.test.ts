/**
 * scheduler-dispatch.test.ts
 *
 * Integration-level unit tests for the scheduler's public fire* functions.
 * All Discord, DB, oracle, and combat-event dependencies are mocked so the
 * tests run without a bot token or live database.
 *
 * Covered:
 *  - fireEvent:         createEvent called with ~1-hour expiry and correct args
 *  - fireFinalBoss:     boss state computed from participant levels, activeBossMap set
 *  - fireChest:         rollChest wired, return value structure, expiry in chestId
 *  - fireLockedChest:   spawnLockedChest wired, locked-chest message sent to channel
 *  - BOSS_RARITY_WEIGHTS: imported from scheduler (not a local mirror)
 *  - EVENT_DURATION_MS:   imported from scheduler (not a local mirror)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TEST_GUILD_ID = "test-guild-1";

// ── Hoist: WeakSet-backed TextChannel so instanceof works across module scopes ─
const { MockTextChannel } = vi.hoisted(() => {
  const _instances = new WeakSet<object>();

  class MockTextChannel {
    guildId = "test-guild-1";
    send     = vi.fn();
    messages = { fetch: vi.fn() };

    constructor() {
      _instances.add(this);
    }

    static [Symbol.hasInstance](obj: unknown): boolean {
      if (obj === null || typeof obj !== "object") return false;
      return _instances.has(obj as object);
    }
  }

  return { MockTextChannel };
});

// ── 1. Mock discord.js ────────────────────────────────────────────────────────
vi.mock("discord.js", () => {
  class MockEmbedBuilder {
    setColor()     { return this; }
    setTitle()     { return this; }
    setDescription() { return this; }
    setImage()     { return this; }
    setFooter()    { return this; }
    setTimestamp() { return this; }
  }

  class MockButtonBuilder {
    setCustomId()  { return this; }
    setLabel()     { return this; }
    setStyle()     { return this; }
    setEmoji()     { return this; }
    setDisabled()  { return this; }
  }

  class MockActionRowBuilder {
    addComponents() { return this; }
  }

  return {
    TextChannel:      MockTextChannel,
    Client:           class MockClient {},
    EmbedBuilder:     MockEmbedBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder:    MockButtonBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
  };
});

// ── 2. Mock logger ────────────────────────────────────────────────────────────
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── 3. Mock survival (fully; avoids real discord.js initialisation) ───────────
const MOCK_CHEST_RARITY = {
  key: "bronz", emoji: "🪙", label: "Cufăr de Bronz",
  color: 0xcd7f32, min: 10, max: 40, weight: 58,
};
const MOCK_LOCKED_RARITY = {
  key: "argint", emoji: "🥈", label: "Cufăr de Argint",
  color: 0xc0c0c0, min: 40, max: 90, weight: 28,
};

const mockRollChest          = vi.fn(() => ({ rarity: MOCK_CHEST_RARITY, gold: 25 }));
const mockSpawnLockedChest   = vi.fn((_rarityKey: unknown) => ({ rarity: MOCK_LOCKED_RARITY, gold: 200 }));
const mockBossMaxHp          = vi.fn((level: number, _rarity: string) => level * 2000);
const mockComputeBossRewards = vi.fn(() => new Map<string, { rep: number; gold: number; xp: number }>());

vi.mock("../survival", () => ({
  buildStartEmbed:        vi.fn(() => ({})),
  buildExpiredCronica:    vi.fn(() => ({})),
  buildChestEmbed:        vi.fn(() => ({})),
  buildExpiredChestEmbed: vi.fn(() => ({})),
  buildFinalBossEmbed:    vi.fn(() => ({})),
  buildBossLeaderboard:   vi.fn(() => ({})),
  buildLockedChestEmbed:  vi.fn(() => ({})),
  buildKeyChestEmbed:     vi.fn(() => ({})),
  finalBossRow:           vi.fn(() => ({})),
  oracleMessage:          vi.fn(() => "oracle msg"),
  rollChest:              () => mockRollChest(),
  spawnLockedChest:       (rarityKey: unknown) => mockSpawnLockedChest(rarityKey),
  rollKeyChestType:       vi.fn(() => "rar"),
  spawnChest:             vi.fn(() => ({ rarity: MOCK_CHEST_RARITY, gold: 25 })),
  bossMaxHp:              (level: unknown, rarity: unknown) => mockBossMaxHp(level as number, rarity as string),
  computeBossRewards:     (...a: unknown[]) => (mockComputeBossRewards as (...x: unknown[]) => unknown)(...a),
  veteranRank:            vi.fn(() => 0),
  veteranMult:            vi.fn(() => 1),
}));

// ── 4. Mock DB ────────────────────────────────────────────────────────────────
const mockCreateEvent          = vi.fn();
const mockGetActiveEvent       = vi.fn();
const mockGetEventParticipants = vi.fn();
const mockGetAllEvents         = vi.fn();

vi.mock("../db", () => ({
  createEvent:                    (...a: unknown[]) => mockCreateEvent(...a),
  deactivateEvent:                vi.fn().mockResolvedValue(undefined),
  getExpiredActiveEvents:         vi.fn().mockResolvedValue([]),
  getEventParticipants:           (...a: unknown[]) => mockGetEventParticipants(...a),
  getAllEvents:                    (...a: unknown[]) => mockGetAllEvents(...a),
  setEventDecreeMessage:          vi.fn().mockResolvedValue(undefined),
  deleteEvent:                    vi.fn().mockResolvedValue(undefined),
  getLatestActiveEvent:           vi.fn().mockResolvedValue(null),
  getActiveEvent:                 (...a: unknown[]) => mockGetActiveEvent(...a),
  setHonorTitle:                  vi.fn().mockResolvedValue(undefined),
  addPlayerReputation:            vi.fn().mockResolvedValue(undefined),
  addPlayerGold:                  vi.fn().mockResolvedValue(undefined),
  addPlayerXp:                    vi.fn().mockResolvedValue(undefined),
  getPrestigeLevels:              vi.fn().mockResolvedValue(new Map()),
  // Boss persistence
  persistActiveBoss:              vi.fn().mockResolvedValue(undefined),
  loadAllActiveBossRows:          vi.fn().mockResolvedValue([]),
  deleteActiveBoss:               vi.fn().mockResolvedValue(undefined),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
  // Chest persistence
  persistActiveChest:             vi.fn().mockResolvedValue(undefined),
  loadActiveChest:                vi.fn().mockResolvedValue(null),
  clearActiveChest:               vi.fn().mockResolvedValue(undefined),
  getFinalBossKills:              vi.fn().mockResolvedValue(0),
  incrementFinalBossKills:        vi.fn().mockResolvedValue(undefined),
}));

// ── 5. Mock oracle & combat-events ────────────────────────────────────────────
vi.mock("../oracle",        () => ({ startOracle: vi.fn(), setOracleExtatic: vi.fn() }));
vi.mock("../combat-events", () => ({ triggerRandomBattleEvent: vi.fn() }));

// ── 6. Mock channel-config — return a dummy channel ID for every guild/type ──
vi.mock("../channel-config", () => ({
  getChannel:       vi.fn(() => "mock-channel-id"),
  initChannelConfig: vi.fn(),
  getAllChannels:    vi.fn(() => ({})),
  setChannel:       vi.fn(),
  resetChannel:     vi.fn(),
  resetAllChannels: vi.fn(),
}));

// ── Import scheduler after all mocks are registered ──────────────────────────
import {
  fireEvent,
  fireFinalBoss,
  fireChest,
  fireLockedChest,
  getGuildActiveBossMap,
  getGuildClaimedChests,
  BOSS_RARITY_WEIGHTS,
  EVENT_DURATION_MS,
} from "../scheduler";

// ── Helper: build a fresh mock Discord client ─────────────────────────────────
function makeMockClient(overrideChannel?: unknown): {
  client: import("discord.js").Client;
  channel: InstanceType<typeof MockTextChannel>;
  msg: { id: string; edit: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
} {
  const msg = {
    id:     "mock-msg-id",
    edit:   vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const channel = new MockTextChannel();
  channel.send.mockResolvedValue(msg);
  channel.messages.fetch.mockResolvedValue(msg);

  const ch = overrideChannel ?? channel;
  const client = {
    channels: { fetch: vi.fn().mockResolvedValue(ch) },
  } as unknown as import("discord.js").Client;

  return { client, channel, msg };
}

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  getGuildActiveBossMap(TEST_GUILD_ID).clear();
  getGuildClaimedChests(TEST_GUILD_ID).clear();

  mockCreateEvent.mockResolvedValue({ id: 42, messageId: "mock-msg-id" });
  mockGetActiveEvent.mockResolvedValue(null);
  mockGetEventParticipants.mockResolvedValue([]);
  mockGetAllEvents.mockResolvedValue([]);
  mockRollChest.mockReturnValue({ rarity: MOCK_CHEST_RARITY, gold: 25 });
  mockSpawnLockedChest.mockReturnValue({ rarity: MOCK_LOCKED_RARITY, gold: 200 });
  mockBossMaxHp.mockImplementation((level: number, _rarity: string) => level * 2000);
  mockComputeBossRewards.mockReturnValue(new Map());
});

// ─── BOSS_RARITY_WEIGHTS (imported directly from scheduler.ts) ───────────────

describe("BOSS_RARITY_WEIGHTS (from scheduler.ts)", () => {
  it("sums to exactly 100", () => {
    const total = BOSS_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    expect(total).toBe(100);
  });

  it("comun has the highest weight", () => {
    const sorted = [...BOSS_RARITY_WEIGHTS].sort((a, b) => b[1] - a[1]);
    expect(sorted[0]![0]).toBe("comun");
  });

  it("legendar has the lowest weight", () => {
    const sorted = [...BOSS_RARITY_WEIGHTS].sort((a, b) => a[1] - b[1]);
    expect(sorted[0]![0]).toBe("legendar");
  });

  it("covers exactly: comun, rar, epic, legendar", () => {
    const keys = BOSS_RARITY_WEIGHTS.map(([k]) => k).sort();
    expect(keys).toEqual(["comun", "epic", "legendar", "rar"]);
  });

  it("all weights are positive integers", () => {
    for (const [, w] of BOSS_RARITY_WEIGHTS) {
      expect(w).toBeGreaterThan(0);
      expect(Number.isInteger(w)).toBe(true);
    }
  });
});

// ─── EVENT_DURATION_MS (imported directly from scheduler.ts) ─────────────────

describe("EVENT_DURATION_MS (from scheduler.ts)", () => {
  it("is exactly one hour in milliseconds", () => {
    expect(EVENT_DURATION_MS).toBe(60 * 60 * 1000);
  });
});

// ─── fireEvent ───────────────────────────────────────────────────────────────

describe("fireEvent", () => {
  it("calls createEvent with expiresAt approximately 1 hour from now", async () => {
    const { client } = makeMockClient();
    const before = Date.now();
    await fireEvent(client, TEST_GUILD_ID);
    const after = Date.now();

    expect(mockCreateEvent).toHaveBeenCalledOnce();
    // createEvent(guildId, type, messageId, expiresAt) — expiresAt is at index 3
    const [, , , expiresAt] = mockCreateEvent.mock.calls[0]!;
    const ms = (expiresAt as Date).getTime();

    expect(ms).toBeGreaterThanOrEqual(before + EVENT_DURATION_MS);
    expect(ms).toBeLessThanOrEqual(after  + EVENT_DURATION_MS);
  });

  it("calls createEvent with event type 'ora_umbrelor'", async () => {
    const { client } = makeMockClient();
    await fireEvent(client, TEST_GUILD_ID);

    // guildId is index 0, type is index 1
    expect(mockCreateEvent.mock.calls[0]![1]).toBe("ora_umbrelor");
  });

  it("calls createEvent with the message ID from the placeholder send", async () => {
    const { client } = makeMockClient();
    await fireEvent(client, TEST_GUILD_ID);

    // messageId is index 2
    expect(mockCreateEvent.mock.calls[0]![2]).toBe("mock-msg-id");
  });

  it("edits the placeholder message to wire the join button after obtaining the event ID", async () => {
    const { client, msg } = makeMockClient();
    await fireEvent(client, TEST_GUILD_ID);

    expect(msg.edit).toHaveBeenCalled();
  });

  it("does nothing when the event channel is not a TextChannel", async () => {
    const { client } = makeMockClient({});
    await fireEvent(client, TEST_GUILD_ID);

    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it("resolves without throwing when createEvent succeeds", async () => {
    const { client } = makeMockClient();
    await expect(fireEvent(client, TEST_GUILD_ID)).resolves.toBeUndefined();
  });
});

// ─── fireFinalBoss ────────────────────────────────────────────────────────────

describe("fireFinalBoss", () => {
  function makeActiveEvent(eventId: number) {
    return { id: eventId, isActive: true, expiresAt: new Date(Date.now() + 60_000) };
  }

  it("does nothing when the event is not found in the DB", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(null);
    const { client } = makeMockClient();
    await fireFinalBoss(client, TEST_GUILD_ID, 99);
    expect(getGuildActiveBossMap(TEST_GUILD_ID).has(99)).toBe(false);
  });

  it("does nothing when the event is already expired", async () => {
    mockGetActiveEvent.mockResolvedValueOnce({
      id: 1, isActive: true, expiresAt: new Date(Date.now() - 1000),
    });
    const { client } = makeMockClient();
    await fireFinalBoss(client, TEST_GUILD_ID, 1);
    expect(getGuildActiveBossMap(TEST_GUILD_ID).has(1)).toBe(false);
  });

  it("does nothing when the event is marked inactive", async () => {
    mockGetActiveEvent.mockResolvedValueOnce({
      id: 2, isActive: false, expiresAt: new Date(Date.now() + 60_000),
    });
    const { client } = makeMockClient();
    await fireFinalBoss(client, TEST_GUILD_ID, 2);
    expect(getGuildActiveBossMap(TEST_GUILD_ID).has(2)).toBe(false);
  });

  it("adds the boss to activeBossMap when event is active", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(10));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 10);

    expect(getGuildActiveBossMap(TEST_GUILD_ID).has(10)).toBe(true);
  });

  it("falls back to boss level 5 when there are no alive participants", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(11));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 11);

    expect(getGuildActiveBossMap(TEST_GUILD_ID).get(11)!.level).toBe(5);
  });

  it("computes boss level from alive participant monster levels", async () => {
    // avg = ceil(20) = 20 → bossLevel = max(5, ceil(10)) = 10
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(12));
    mockGetEventParticipants.mockResolvedValueOnce([
      { discordId: "u1", username: "Alice", monsterLevel: 20, totalDamage: 0, isAlive: true,  fled: false },
      { discordId: "u2", username: "Bob",   monsterLevel: 20, totalDamage: 0, isAlive: true,  fled: false },
    ]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 12);

    expect(getGuildActiveBossMap(TEST_GUILD_ID).get(12)!.level).toBe(10);
  });

  it("excludes dead participants from the average level calculation", async () => {
    // Only alive participant at level 10 → avgLevel = 10 → bossLevel = max(5,5) = 5
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(13));
    mockGetEventParticipants.mockResolvedValueOnce([
      { discordId: "dead", username: "Dead",  monsterLevel: 100, totalDamage: 0, isAlive: false, fled: false },
      { discordId: "u1",   username: "Alice", monsterLevel: 10,  totalDamage: 0, isAlive: true,  fled: false },
    ]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 13);

    expect(getGuildActiveBossMap(TEST_GUILD_ID).get(13)!.level).toBe(5);
  });

  it("stores all participants (alive and dead) in the boss state", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(14));
    mockGetEventParticipants.mockResolvedValueOnce([
      { discordId: "u1", username: "Alice", monsterLevel: 5, totalDamage: 100, isAlive: true,  fled: false },
      { discordId: "u2", username: "Bob",   monsterLevel: 3, totalDamage: 50,  isAlive: false, fled: true  },
    ]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 14);

    const boss = getGuildActiveBossMap(TEST_GUILD_ID).get(14)!;
    expect(boss.participants).toHaveLength(2);
    expect(boss.participants.find((p) => p.discordId === "u1")!.isAlive).toBe(true);
    expect(boss.participants.find((p) => p.discordId === "u2")!.isAlive).toBe(false);
  });

  it("starts the boss with full HP (currentHp === maxHp) and both > 0", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(15));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 15);

    const boss = getGuildActiveBossMap(TEST_GUILD_ID).get(15)!;
    expect(boss.currentHp).toBe(boss.maxHp);
    expect(boss.currentHp).toBeGreaterThan(0);
  });

  it("initialises damage and hit maps as empty", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(16));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 16);

    const boss = getGuildActiveBossMap(TEST_GUILD_ID).get(16)!;
    expect(boss.damageBy.size).toBe(0);
    expect(boss.lastHitAt.size).toBe(0);
  });

  it("sets defeated = false on the newly spawned boss", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(17));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 17);

    expect(getGuildActiveBossMap(TEST_GUILD_ID).get(17)!.defeated).toBe(false);
  });

  it("always spawns the final boss with veteranRank 0 (no veteran scaling)", async () => {
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(19));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 19);

    const boss = getGuildActiveBossMap(TEST_GUILD_ID).get(19)!;
    expect(boss.veteranRank).toBe(0);
    // maxHp is exactly bossMaxHp(level, rarity) — no veteran multiplier applied
    expect(boss.maxHp).toBe(5 * 2000);
  });

  it("passes the computed boss level to bossMaxHp", async () => {
    // No alive participants → bossLevel = 5 (fallback)
    mockGetActiveEvent.mockResolvedValueOnce(makeActiveEvent(18));
    mockGetEventParticipants.mockResolvedValueOnce([]);
    const { client } = makeMockClient();

    await fireFinalBoss(client, TEST_GUILD_ID, 18);

    expect(mockBossMaxHp).toHaveBeenCalledWith(5, expect.any(String));
  });
});

// ─── fireChest ───────────────────────────────────────────────────────────────

describe("fireChest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function runFireChest(client: import("discord.js").Client) {
    // bypassGate=true: these tests cover the chest-spawn logic, not the
    // activity gate (tested separately in scheduler-activity-gate.test.ts).
    const p = fireChest(client, TEST_GUILD_ID, true);
    await vi.advanceTimersByTimeAsync(30_000);
    return p;
  }

  it("returns a chestId, gold, and expireAt on success", async () => {
    const { client } = makeMockClient();
    const result = await runFireChest(client);

    expect(result).not.toBeNull();
    expect(result!.chestId.startsWith("chest_")).toBe(true);
    expect(result!.gold).toBe(25);
    expect(result!.expireAt).toBeGreaterThan(0);
  });

  it("encodes rarity key and gold amount into the chestId", async () => {
    const { client } = makeMockClient();
    const result = await runFireChest(client);

    const parts = result!.chestId.split("_");
    expect(parts[0]).toBe("chest");
    expect(parts[2]).toBe("bronz");
    expect(Number(parts[3])).toBe(25);
  });

  it("calls rollChest to determine rarity", async () => {
    const { client } = makeMockClient();
    await runFireChest(client);

    expect(mockRollChest).toHaveBeenCalled();
  });

  it("sends a message to the main channel", async () => {
    const { client, channel } = makeMockClient();
    await runFireChest(client);

    expect(channel.send).toHaveBeenCalled();
  });

  it("returns null when the channel is not a TextChannel", async () => {
    const { client } = makeMockClient({});
    const result = await runFireChest(client);

    expect(result).toBeNull();
  });

  it("chest starts unclaimed (not in claimedChests)", async () => {
    const { client } = makeMockClient();
    const result = await runFireChest(client);

    expect(getGuildClaimedChests(TEST_GUILD_ID).has(result!.chestId)).toBe(false);
  });
});

// ─── fireLockedChest ──────────────────────────────────────────────────────────

describe("fireLockedChest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a locked-chest message to the main channel", async () => {
    const { client, channel } = makeMockClient();
    await fireLockedChest(client, TEST_GUILD_ID, "argint");

    expect(channel.send).toHaveBeenCalledOnce();
  });

  it("does nothing when spawnLockedChest returns null (invalid rarity)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSpawnLockedChest.mockReturnValueOnce(null as any);
    const { client, channel } = makeMockClient();

    await fireLockedChest(client, TEST_GUILD_ID, "invalid_rarity");

    expect(channel.send).not.toHaveBeenCalled();
  });

  it("does nothing when channel is not a TextChannel", async () => {
    const { client } = makeMockClient({});
    await fireLockedChest(client, TEST_GUILD_ID, "argint");

    expect(mockSpawnLockedChest).not.toHaveBeenCalled();
  });

  it("resolves without throwing for a valid rarity", async () => {
    const { client } = makeMockClient();
    await expect(fireLockedChest(client, TEST_GUILD_ID, "argint")).resolves.toBeUndefined();
  });
});
