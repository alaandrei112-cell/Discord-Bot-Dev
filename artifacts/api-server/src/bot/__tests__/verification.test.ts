import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  addRole: vi.fn(),
}));

vi.mock("../db", () => ({
  loadVerificationConfig: mocks.loadConfig,
  saveVerificationConfig: vi.fn(),
}));

import { verifyMember } from "../verification";

describe("Discord member verification", () => {
  const guildId = "123456789";
  const userId = "987654321";
  const roleId = "555555555";

  function makeClient({
    role = { id: roleId, managed: false, position: 2 },
    botPosition = 10,
    memberRoleIds = [],
  }: {
    role?: { id: string; managed: boolean; position: number } | null;
    botPosition?: number;
    memberRoleIds?: string[];
  } = {}) {
    const member = {
      roles: {
        cache: new Map(memberRoleIds.map((id) => [id, { id }])),
        add: mocks.addRole,
      },
    };
    const botMember = {
      permissions: { has: vi.fn(() => true) },
      roles: { highest: { position: botPosition } },
    };
    const guild = {
      members: {
        fetch: vi.fn(async (id?: string) => id === userId ? member : botMember),
        me: botMember,
        fetchMe: vi.fn(async () => botMember),
      },
      roles: {
        fetch: vi.fn(async () => role),
      },
    };
    return { client: { guilds: { fetch: vi.fn(async () => guild) } }, member, botMember, guild };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadConfig.mockResolvedValue({ enabled: true, roleId });
  });

  it("awards the configured role to a member who is not verified yet", async () => {
    const { client, member } = makeClient();

    await expect(verifyMember(client as never, guildId, userId)).resolves.toBe("verified");
    expect(member.roles.add).toHaveBeenCalledWith(
      { id: roleId, managed: false, position: 2 },
      "Verificare confirmată prin site",
    );
  });

  it("rejects verification when the configured role no longer exists", async () => {
    const { client } = makeClient({ role: null });

    await expect(verifyMember(client as never, guildId, userId)).rejects.toThrow("Rolul de verificare nu mai există.");
    expect(mocks.addRole).not.toHaveBeenCalled();
  });

  it("rejects verification when the bot cannot manage the configured role", async () => {
    const { client } = makeClient({ botPosition: 2 });

    await expect(verifyMember(client as never, guildId, userId)).rejects.toThrow(
      "Rolul de verificare trebuie să fie sub rolul botului și să nu fie managed.",
    );
    expect(mocks.addRole).not.toHaveBeenCalled();
  });
});