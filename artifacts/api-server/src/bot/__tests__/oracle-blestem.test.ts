import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("discord.js", () => ({
  MessageFlags: { Ephemeral: 64 },
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGrantRandomCurse = vi.fn().mockReturnValue({
  id: "ghinionul_umbrelor",
  label: "Ghinionul Umbrelor",
  emoji: "🌑",
  flavor: "-10% Oboli în luptă",
  kind: "curse",
  durationMs: 480_000,
  mods: { goldMult: 0.9 },
});

vi.mock("../status-effects", () => ({
  grantRandomCurse: (...args: unknown[]) => mockGrantRandomCurse(...args),
}));

vi.mock("../survival", () => ({
  THEME_COLOR: 0x8a4a2f,
  BRAND_FOOTER: "Regatul Cenușii — Cronica Umbrelor",
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { handleBlestem, handleAdminGhid } from "../oracle-blestem";
import { logger } from "../../lib/logger";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInteraction({
  targetId = "player-123",
  targetIsBot = false,
  adminId = "admin-999",
}: {
  targetId?: string;
  targetIsBot?: boolean;
  adminId?: string;
} = {}) {
  const channelSend = vi.fn().mockResolvedValue({});
  const deferReply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const reply = vi.fn().mockResolvedValue(undefined);

  return {
    deferReply,
    editReply,
    reply,
    channel: { send: channelSend },
    user: { id: adminId },
    options: {
      getUser: vi.fn().mockReturnValue({ id: targetId, bot: targetIsBot }),
    },
    _channelSend: channelSend,
  };
}

// ── handleBlestem ─────────────────────────────────────────────────────────────

describe("handleBlestem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGrantRandomCurse.mockReturnValue({
      id: "ghinionul_umbrelor",
      label: "Ghinionul Umbrelor",
      emoji: "🌑",
      flavor: "-10% Oboli în luptă",
      kind: "curse",
      durationMs: 480_000,
      mods: { goldMult: 0.9 },
    });
  });

  it("calls grantRandomCurse with the target's Discord ID", async () => {
    const interaction = makeInteraction({ targetId: "player-456" });
    await handleBlestem(interaction as never);
    expect(mockGrantRandomCurse).toHaveBeenCalledOnce();
    expect(mockGrantRandomCurse).toHaveBeenCalledWith("player-456");
  });

  it("sends a public in-character message that mentions the target", async () => {
    const interaction = makeInteraction({ targetId: "player-456" });
    await handleBlestem(interaction as never);
    expect(interaction._channelSend).toHaveBeenCalledOnce();
    const sent = interaction._channelSend.mock.calls[0]?.[0] as { content: string; allowedMentions: { users: string[] } };
    expect(sent.content).toContain("<@player-456>");
    expect(sent.content).toContain("Ghinionul Umbrelor");
    expect(sent.content).toContain("🌑");
    expect(sent.allowedMentions.users).toContain("player-456");
  });

  it("sends an ephemeral confirmation reply containing ✅", async () => {
    const interaction = makeInteraction();
    await handleBlestem(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("✅") }),
    );
  });

  it("uses curse.flavor as the description (falling back gracefully when absent)", async () => {
    mockGrantRandomCurse.mockReturnValueOnce({
      id: "test-curse",
      label: "Test Blestem",
      emoji: "💀",
      flavor: "reducere XP",
      kind: "curse",
      durationMs: 480_000,
      mods: {},
    });
    const interaction = makeInteraction({ targetId: "player-789" });
    await handleBlestem(interaction as never);
    const sent = interaction._channelSend.mock.calls[0]?.[0] as { content: string };
    expect(sent.content).toContain("reducere XP");
  });

  it("refuses to curse a bot — does NOT call grantRandomCurse", async () => {
    const interaction = makeInteraction({ targetIsBot: true });
    await handleBlestem(interaction as never);
    expect(mockGrantRandomCurse).not.toHaveBeenCalled();
    expect(interaction._channelSend).not.toHaveBeenCalled();
  });

  it("replies with a refusal message when the target is a bot", async () => {
    const interaction = makeInteraction({ targetIsBot: true });
    await handleBlestem(interaction as never);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("spirit artificial") }),
    );
  });

  it("logs adminId, targetId, and curse.id after a successful curse", async () => {
    const interaction = makeInteraction({ targetId: "player-abc", adminId: "admin-xyz" });
    await handleBlestem(interaction as never);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: "admin-xyz",
        targetId: "player-abc",
        curse: "ghinionul_umbrelor",
      }),
      expect.any(String),
    );
  });
});

// ── handleAdminGhid ───────────────────────────────────────────────────────────

describe("handleAdminGhid", () => {
  it("replies ephemerally with an embed", async () => {
    const interaction = makeInteraction();
    await handleAdminGhid(interaction as never);
    expect(interaction.reply).toHaveBeenCalledOnce();
    const call = interaction.reply.mock.calls[0]?.[0] as {
      flags: number;
      embeds: { title: string; fields: { name: string; value: string }[] }[];
    };
    expect(call.flags).toBe(64); // MessageFlags.Ephemeral
    expect(call.embeds).toHaveLength(1);
  });

  it("embed contains the justice trigger phrases", async () => {
    const interaction = makeInteraction();
    await handleAdminGhid(interaction as never);
    const call = interaction.reply.mock.calls[0]?.[0] as {
      embeds: { fields: { value: string }[] }[];
    };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("fa dreptate");
    expect(allText).toContain("judeca-i");
    expect(allText).toContain("aplica blestemul");
  });

  it("embed contains the pardon trigger phrases", async () => {
    const interaction = makeInteraction();
    await handleAdminGhid(interaction as never);
    const call = interaction.reply.mock.calls[0]?.[0] as {
      embeds: { fields: { value: string }[] }[];
    };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("iarta");
    expect(allText).toContain("pardoneaza");
    expect(allText).toContain("reseteaza blestemul");
  });

  it("embed lists the /blestem and /startevent slash commands", async () => {
    const interaction = makeInteraction();
    await handleAdminGhid(interaction as never);
    const call = interaction.reply.mock.calls[0]?.[0] as {
      embeds: { fields: { value: string }[] }[];
    };
    const allText = call.embeds[0]!.fields.map((f) => f.value).join("\n");
    expect(allText).toContain("/blestem");
    expect(allText).toContain("/startevent");
    expect(allText).toContain("/admin offline");
  });

  it("embed title mentions Regatul Cenusii", async () => {
    const interaction = makeInteraction();
    await handleAdminGhid(interaction as never);
    const call = interaction.reply.mock.calls[0]?.[0] as {
      embeds: { title: string }[];
    };
    expect(call.embeds[0]!.title).toContain("Regatul");
  });
});
