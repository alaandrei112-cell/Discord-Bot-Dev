import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_GUILD_ID = "test-guild-1";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("discord.js", () => ({
  Client: vi.fn(),
  TextChannel: class TextChannel {},
  ActionRowBuilder: class {
    components: unknown[] = [];
    addComponents(...c: unknown[]) { this.components.push(...c); return this; }
  },
  ButtonBuilder: class {
    data: Record<string, unknown> = {};
    setCustomId(v: string) { this.data.customId = v; return this; }
    setLabel(v: string) { this.data.label = v; return this; }
    setEmoji(v: string) { this.data.emoji = v; return this; }
    setStyle(v: unknown) { this.data.style = v; return this; }
    setDisabled(v: boolean) { this.data.disabled = v; return this; }
  },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 },
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockLoadActiveChest = vi.fn();
const mockClearActiveChest = vi.fn().mockResolvedValue(undefined);
const mockPersistActiveChest = vi.fn().mockResolvedValue(undefined);

vi.mock("../db", () => ({
  loadActiveChest: (...args: unknown[]) => mockLoadActiveChest(...args),
  clearActiveChest: (...args: unknown[]) => mockClearActiveChest(...args),
  persistActiveChest: (...args: unknown[]) => mockPersistActiveChest(...args),
  KEYCHEST_DBKEY: "active_keychest",
  LOCKCHEST_DBKEY: "active_lockchest",
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
  getPrestigeLevels: vi.fn().mockResolvedValue(new Map()),
  persistActiveBoss: vi.fn(),
  loadAllActiveBossRows: vi.fn().mockResolvedValue([]),
  deleteActiveBoss: vi.fn(),
  createActiveBossesTableIfNotExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../survival", () => ({
  buildExpiredChestEmbed: vi.fn().mockReturnValue({ type: "expired-embed" }),
  buildStartEmbed: vi.fn().mockReturnValue({}),
  buildExpiredCronica: vi.fn().mockReturnValue({}),
  buildChestEmbed: vi.fn().mockReturnValue({}),
  rollChest: vi.fn().mockReturnValue({ rarity: { key: "bronz", label: "Cufăr de Bronz", emoji: "🪙" }, gold: 20 }),
  oracleMessage: vi.fn().mockReturnValue(""),
  buildFinalBossEmbed: vi.fn().mockReturnValue({}),
  buildBossLeaderboard: vi.fn().mockReturnValue({}),
  buildEventLeaderboard: vi.fn().mockReturnValue({}),
  buildLockedChestEmbed: vi.fn().mockReturnValue({}),
  buildKeyChestEmbed: vi.fn().mockReturnValue({}),
  spawnLockedChest: vi.fn(),
  rollKeyChestType: vi.fn().mockReturnValue("rar"),
  computeBossRewards: vi.fn().mockReturnValue(new Map()),
  finalBossRow: vi.fn().mockReturnValue({}),
  bossMaxHp: vi.fn().mockReturnValue(1000),
  CHEST_RARITIES: [
    { key: "bronz",  label: "Cufăr de Bronz",  emoji: "🪙",  color: 0xcd7f32, min: 10, max: 40,  weight: 58 },
    { key: "argint", label: "Cufăr de Argint", emoji: "🥈",  color: 0xc0c0c0, min: 40, max: 90,  weight: 28 },
  ],
}));

vi.mock("../oracle", () => ({ startOracle: vi.fn(), setOracleExtatic: vi.fn() }));
vi.mock("../oracle-chat", () => ({ maybeReplyAsOracle: vi.fn(), logOracleChatStatus: vi.fn() }));
vi.mock("../combat-events", () => ({ triggerRandomBattleEvent: vi.fn(), getActiveBattleEvent: vi.fn() }));
vi.mock("../status-effects", () => ({ getRewardMultipliers: vi.fn().mockReturnValue({ goldMult: 1, xpMult: 1 }), getCombatModifiers: vi.fn() }));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { rehydrateActiveChest, rehydrateSimpleChest, getGuildClaimedChests } from "../scheduler";
import { logger } from "../../lib/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeChannel(
  msgEdit: ReturnType<typeof vi.fn> | null,
  msgDelete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
) {
  const { TextChannel } = await import("discord.js");
  const ch = Object.create(TextChannel.prototype) as {
    guildId: string;
    messages: { fetch: ReturnType<typeof vi.fn> };
  };
  ch.guildId = TEST_GUILD_ID;
  ch.messages = {
    fetch: vi.fn().mockResolvedValue(msgEdit ? { id: "message-1", edit: msgEdit, delete: msgDelete } : null),
  };
  return ch;
}

const FUTURE = Date.now() + 60_000;
const PAST   = Date.now() - 1;

// ── rehydrateActiveChest ───────────────────────────────────────────────────────

describe("rehydrateActiveChest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGuildClaimedChests(TEST_GUILD_ID).clear();
    mockLoadActiveChest.mockResolvedValue(null);
  });

  it("returns immediately when no persisted record exists", async () => {
    mockLoadActiveChest.mockResolvedValue(null);
    await rehydrateActiveChest({ channels: { fetch: vi.fn() } } as never, TEST_GUILD_ID);
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });

  it("calls clearActiveChest and marks chestId claimed when expiry has passed", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-111",
      channelId: "ch-001",
      chestId: "chest_111_bronz_20",
      gold: 20,
      rarityKey: "bronz",
      expiresAt: PAST,
    });
    const msgEdit = vi.fn().mockResolvedValue(undefined);
    const ch = await makeChannel(msgEdit);
    await rehydrateActiveChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID);
    expect(mockClearActiveChest).toHaveBeenCalledOnce();
    expect(getGuildClaimedChests(TEST_GUILD_ID).has("chest_111_bronz_20")).toBe(true);
  });

  it("calls clearActiveChest when the channel is not found", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-222",
      channelId: "ch-gone",
      chestId: "chest_222_argint_50",
      gold: 50,
      rarityKey: "argint",
      expiresAt: FUTURE,
    });
    await rehydrateActiveChest({ channels: { fetch: vi.fn().mockResolvedValue(null) } } as never, TEST_GUILD_ID);
    expect(mockClearActiveChest).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs a structured message when clearing a stale expired chest", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-333",
      channelId: "ch-001",
      chestId: "chest_333_bronz_15",
      gold: 15,
      rarityKey: "bronz",
      expiresAt: PAST,
    });
    const ch = await makeChannel(null);
    await rehydrateActiveChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ chestId: "chest_333_bronz_15" }),
      expect.stringContaining("restart"),
    );
  });

  it("does not crash and calls clearActiveChest when loadActiveChest returns malformed data", async () => {
    mockLoadActiveChest.mockRejectedValue(new Error("DB error"));
    await rehydrateActiveChest({ channels: { fetch: vi.fn() } } as never, TEST_GUILD_ID);
    expect(logger.error).toHaveBeenCalled();
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });
});

// ── rehydrateSimpleChest — key chest ──────────────────────────────────────────

describe("rehydrateSimpleChest (keychest)", () => {
  const KEYCHEST_DBKEY = "active_keychest";

  beforeEach(() => {
    vi.clearAllMocks();
    getGuildClaimedChests(TEST_GUILD_ID).clear();
    mockLoadActiveChest.mockResolvedValue(null);
  });

  it("returns immediately when no persisted key-chest record exists", async () => {
    await rehydrateSimpleChest({ channels: { fetch: vi.fn() } } as never, TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });

  it("expires stale key-chest, marks chestId claimed, and clears DB row", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-kc1",
      channelId: "ch-001",
      chestId: "keychest_111_rar",
      gold: 0,
      rarityKey: "rar",
      kind: "keychest",
      keyType: "rar",
      expiresAt: PAST,
    });
    const msgEdit = vi.fn().mockResolvedValue(undefined);
    const ch = await makeChannel(msgEdit);
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(mockClearActiveChest).toHaveBeenCalledWith(TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(getGuildClaimedChests(TEST_GUILD_ID).has("keychest_111_rar")).toBe(true);
  });

  it("deletes an expired key chest instead of leaving a stale message", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-kc2",
      channelId: "ch-001",
      chestId: "keychest_222_epic",
      gold: 0,
      rarityKey: "epic",
      kind: "keychest",
      expiresAt: PAST,
    });
    const msgEdit = vi.fn().mockResolvedValue(undefined);
    const msgDelete = vi.fn().mockResolvedValue(undefined);
    const ch = await makeChannel(msgEdit, msgDelete);
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(msgDelete).toHaveBeenCalledOnce();
    expect(msgEdit).not.toHaveBeenCalled();
  });

  it("clears row and warns when key-chest channel is not found", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-kc3",
      channelId: "ch-gone",
      chestId: "keychest_333_rar",
      gold: 0,
      rarityKey: "rar",
      kind: "keychest",
      expiresAt: FUTURE,
    });
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(null) } } as never, TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(mockClearActiveChest).toHaveBeenCalledWith(TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("swallows DB errors without crashing on key-chest rehydration", async () => {
    mockLoadActiveChest.mockRejectedValue(new Error("DB down"));
    await rehydrateSimpleChest({ channels: { fetch: vi.fn() } } as never, TEST_GUILD_ID, KEYCHEST_DBKEY);
    expect(logger.error).toHaveBeenCalled();
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });
});

// ── rehydrateSimpleChest — locked chest ───────────────────────────────────────

describe("rehydrateSimpleChest (lockchest)", () => {
  const LOCKCHEST_DBKEY = "active_lockchest";

  beforeEach(() => {
    vi.clearAllMocks();
    getGuildClaimedChests(TEST_GUILD_ID).clear();
    mockLoadActiveChest.mockResolvedValue(null);
  });

  it("expires stale locked-chest, marks chestId claimed, and clears DB row", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-lc1",
      channelId: "ch-001",
      chestId: "lockchest_111_argint_60",
      gold: 60,
      rarityKey: "argint",
      kind: "lockchest",
      expiresAt: PAST,
    });
    const msgEdit = vi.fn().mockResolvedValue(undefined);
    const ch = await makeChannel(msgEdit);
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(mockClearActiveChest).toHaveBeenCalledWith(TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(getGuildClaimedChests(TEST_GUILD_ID).has("lockchest_111_argint_60")).toBe(true);
  });

  it("deletes an expired locked chest instead of leaving a stale message", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-lc2",
      channelId: "ch-001",
      chestId: "lockchest_222_bronz_30",
      gold: 30,
      rarityKey: "bronz",
      kind: "lockchest",
      expiresAt: PAST,
    });
    const msgEdit = vi.fn().mockResolvedValue(undefined);
    const msgDelete = vi.fn().mockResolvedValue(undefined);
    const ch = await makeChannel(msgEdit, msgDelete);
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(ch) } } as never, TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(msgDelete).toHaveBeenCalledOnce();
    expect(msgEdit).not.toHaveBeenCalled();
  });

  it("clears row and warns when locked-chest channel is not found", async () => {
    mockLoadActiveChest.mockResolvedValue({
      messageId: "msg-lc3",
      channelId: "ch-gone",
      chestId: "lockchest_333_argint_80",
      gold: 80,
      rarityKey: "argint",
      kind: "lockchest",
      expiresAt: FUTURE,
    });
    await rehydrateSimpleChest({ channels: { fetch: vi.fn().mockResolvedValue(null) } } as never, TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(mockClearActiveChest).toHaveBeenCalledWith(TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("swallows DB errors without crashing on locked-chest rehydration", async () => {
    mockLoadActiveChest.mockRejectedValue(new Error("DB down"));
    await rehydrateSimpleChest({ channels: { fetch: vi.fn() } } as never, TEST_GUILD_ID, LOCKCHEST_DBKEY);
    expect(logger.error).toHaveBeenCalled();
    expect(mockClearActiveChest).not.toHaveBeenCalled();
  });
});
