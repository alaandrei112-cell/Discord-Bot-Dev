import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GAMEPLAY_CONFIG,
  normalizeGameplayConfig,
} from "../gameplay-config";

describe("gameplay configuration normalization", () => {
  it("keeps defaults for malformed persisted values", () => {
    const config = normalizeGameplayConfig({
      events: { eventDurationMinutes: 0, chestExpireMinutes: "20" },
      missions: { kill_10: { target: -1, rewardQty: 0 } },
      economy: { monsterGoldMultiplier: Number.NaN },
    });
    expect(config.events.eventDurationMinutes).toBe(DEFAULT_GAMEPLAY_CONFIG.events.eventDurationMinutes);
    expect(config.events.chestExpireMinutes).toBe(DEFAULT_GAMEPLAY_CONFIG.events.chestExpireMinutes);
    expect(config.missions.kill_10).toEqual(DEFAULT_GAMEPLAY_CONFIG.missions.kill_10);
    expect(config.economy.monsterGoldMultiplier).toBe(1);
  });

  it("normalizes persisted guild values without sharing mutable nested state", () => {
    const config = normalizeGameplayConfig({
      events: { eventDurationMinutes: 12 },
      missions: { rare_3: { target: 8, rewardQty: 4 } },
      economy: { bossXpMultiplier: 2.5 },
    });
    expect(config.events.eventDurationMinutes).toBe(12);
    expect(config.missions.rare_3).toEqual({ target: 8, rewardQty: 4 });
    expect(config.missions.kill_10).toEqual(DEFAULT_GAMEPLAY_CONFIG.missions.kill_10);
    expect(config.economy.bossXpMultiplier).toBe(2.5);
    config.missions.kill_10.target = 99;
    expect(DEFAULT_GAMEPLAY_CONFIG.missions.kill_10.target).toBe(10);
  });

  it("normalizes member announcement settings and keeps disabled defaults for old guild data", () => {
    const oldConfig = normalizeGameplayConfig({ events: { eventDurationMinutes: 12 } });
    expect(oldConfig.memberMessages).toEqual(DEFAULT_GAMEPLAY_CONFIG.memberMessages);

    const config = normalizeGameplayConfig({
      memberMessages: {
        welcomeEnabled: true,
        leaveEnabled: true,
        channelId: "12345678901234567",
        style: "custom",
        customStyle: "  basm românesc  ",
      },
    });
    expect(config.memberMessages).toEqual({
      welcomeEnabled: true,
      leaveEnabled: true,
      channelId: "12345678901234567",
      style: "custom",
      customStyle: "basm românesc",
    });
  });
});

const dbState = new Map<string, unknown>();
vi.mock("../db", () => ({
  loadGameplayConfig: vi.fn(async (guildId: string) => dbState.get(guildId) ?? null),
  saveGameplayConfig: vi.fn(async (guildId: string, config: unknown) => { dbState.set(guildId, structuredClone(config)); }),
}));

describe("gameplay configuration persistence", () => {
  beforeEach(() => dbState.clear());

  it("rehydrates saved values after a fresh store initialization", async () => {
    const store = await import("../gameplay-store");
    await store.saveGuildGameplayConfig("guild-a", {
      ...DEFAULT_GAMEPLAY_CONFIG,
      events: { ...DEFAULT_GAMEPLAY_CONFIG.events, eventDurationMinutes: 17 },
    });
    expect(store.getGameplayConfig("guild-a").events.eventDurationMinutes).toBe(17);

    await store.initGameplayConfig("guild-a");
    expect(store.getGameplayConfig("guild-a").events.eventDurationMinutes).toBe(17);
  });

  it("keeps two guild profiles isolated", async () => {
    const store = await import("../gameplay-store");
    await store.saveGuildGameplayConfig("guild-a", {
      ...DEFAULT_GAMEPLAY_CONFIG,
      economy: { ...DEFAULT_GAMEPLAY_CONFIG.economy, monsterGoldMultiplier: 2 },
    });
    await store.saveGuildGameplayConfig("guild-b", {
      ...DEFAULT_GAMEPLAY_CONFIG,
      economy: { ...DEFAULT_GAMEPLAY_CONFIG.economy, monsterGoldMultiplier: 0.5 },
    });
    expect(store.getGameplayConfig("guild-a").economy.monsterGoldMultiplier).toBe(2);
    expect(store.getGameplayConfig("guild-b").economy.monsterGoldMultiplier).toBe(0.5);
  });
});