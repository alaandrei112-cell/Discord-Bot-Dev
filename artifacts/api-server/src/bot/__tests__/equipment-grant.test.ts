import { beforeEach, describe, expect, it, vi } from "vitest";

const txUpdate = vi.fn();
const txInsert = vi.fn();
const transaction = vi.fn();

vi.mock("@workspace/db", () => {
  const playersTable = {
    discordId: "players.discord_id",
    guildId: "players.guild_id",
    equipmentLevels: "players.equipment_levels",
    equippedWeapon: "players.equipped_weapon",
    equippedArmor: "players.equipped_armor",
  };
  const playerItemsTable = {
    discordId: "player_items.discord_id",
    guildId: "player_items.guild_id",
    itemKey: "player_items.item_key",
    quantity: "player_items.quantity",
  };
  return {
    db: { transaction },
    pool: { query: vi.fn() },
    playersTable,
    playerItemsTable,
    activeEventsTable: {},
    eventParticipantsTable: {},
    eventClaimsTable: {},
    botStateTable: {},
    activeBossesTable: {},
    playerTalismansTable: {},
    playerDailyQuestsTable: {},
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  gte: (left: unknown, right: unknown) => ({ gte: [left, right] }),
  gt: (left: unknown, right: unknown) => ({ gt: [left, right] }),
  lt: (left: unknown, right: unknown) => ({ lt: [left, right] }),
  inArray: (left: unknown, right: unknown) => ({ inArray: [left, right] }),
  desc: (value: unknown) => ({ desc: value }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    { raw: (value: string) => ({ raw: value }) },
  ),
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const player = {
  discordId: "user-1",
  guildId: "guild-1",
  equippedArmor: "platosa_cenusie",
};

describe("grantEquipment", () => {
  beforeEach(() => {
    transaction.mockReset();
    txUpdate.mockReset();
    txInsert.mockReset();
  });

  it("writes the inventory copy and equipment level in one transaction", async () => {
    const returning = vi.fn().mockResolvedValue([player]);
    const where = vi.fn().mockReturnValue({ returning });
    txUpdate.mockReturnValue({ set: vi.fn().mockReturnValue({ where }) });
    txInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ update: txUpdate, insert: txInsert }),
    );

    const { grantEquipment } = await import("../db");
    const result = await grantEquipment("user-1", "guild-1", "platosa_cenusie");

    expect(result).toEqual(player);
    expect(transaction).toHaveBeenCalledOnce();
    expect(txUpdate).toHaveBeenCalledOnce();
    expect(txInsert).toHaveBeenCalledOnce();
  });

  it("rejects an invalid reward without opening a transaction", async () => {
    const { grantEquipment } = await import("../db");

    await expect(grantEquipment("user-1", "guild-1", "not-equipment")).resolves.toBeNull();
    expect(transaction).not.toHaveBeenCalled();
  });
});