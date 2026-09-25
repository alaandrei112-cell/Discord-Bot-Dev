import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextChannel } from "discord.js";

const {
  mockCastOracleCouncilVote,
  mockCloseOracleCouncil,
  mockRecordOracleInteraction,
  mockSaveOracleCouncil,
  mockLoadOracleCouncilDecreeEffect,
  mockSaveOracleCouncilDecreeEffect,
  mockGrantCouncilVoterReputationOnce,
  mockGrantGuildBoost,
  mockRestoreGuildBoost,
} = vi.hoisted(() => ({
  mockCastOracleCouncilVote: vi.fn(),
  mockCloseOracleCouncil: vi.fn(),
  mockRecordOracleInteraction: vi.fn(),
  mockSaveOracleCouncil: vi.fn(),
  mockLoadOracleCouncilDecreeEffect: vi.fn(),
  mockSaveOracleCouncilDecreeEffect: vi.fn(),
  mockGrantCouncilVoterReputationOnce: vi.fn(),
  mockGrantGuildBoost: vi.fn((guildId: string, xpMult: number, goldMult: number, durationMs: number) => ({
    guildId,
    xpMult,
    goldMult,
    expiresAt: Date.now() + durationMs,
  })),
  mockRestoreGuildBoost: vi.fn(),
}));

vi.mock("discord.js", () => {
  class EmbedBuilder {
    data: Record<string, unknown> = {};

    setColor(value: number): this { this.data.color = value; return this; }
    setTitle(value: string): this { this.data.title = value; return this; }
    setDescription(value: string): this { this.data.description = value; return this; }
    addFields(...fields: Array<Record<string, unknown>>): this { this.data.fields = fields; return this; }
    setFooter(value: Record<string, unknown>): this { this.data.footer = value; return this; }
    setTimestamp(): this { this.data.timestamp = true; return this; }
  }

  class ButtonBuilder {
    data: Record<string, unknown> = {};

    setCustomId(value: string): this { this.data.customId = value; return this; }
    setLabel(value: string): this { this.data.label = value; return this; }
    setEmoji(value: string): this { this.data.emoji = value; return this; }
    setStyle(value: number): this { this.data.style = value; return this; }
    setDisabled(value: boolean): this { this.data.disabled = value; return this; }
  }

  class ActionRowBuilder<T = ButtonBuilder> {
    components: T[] = [];

    addComponents(...items: T[]): this {
      this.components.push(...items);
      return this;
    }
  }

  class TextChannel {
    messages: { fetch: ReturnType<typeof vi.fn> } = { fetch: vi.fn() };
    send = vi.fn();
  }

  return {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle: { Secondary: 2 },
    EmbedBuilder,
    MessageFlags: { Ephemeral: 64 },
    TextChannel,
  };
});

vi.mock("../db", () => ({
  grantCouncilVoterReputationOnce: mockGrantCouncilVoterReputationOnce,
  castOracleCouncilVote: mockCastOracleCouncilVote,
  closeOracleCouncil: mockCloseOracleCouncil,
  loadOracleCouncil: vi.fn(),
  loadOracleCouncilDecreeEffect: mockLoadOracleCouncilDecreeEffect,
  recordOracleInteraction: mockRecordOracleInteraction,
  saveOracleCouncilDecreeEffect: mockSaveOracleCouncilDecreeEffect,
  saveOracleCouncil: mockSaveOracleCouncil,
}));

vi.mock("../status-effects", () => ({
  grantGuildBoost: mockGrantGuildBoost,
  restoreGuildBoost: mockRestoreGuildBoost,
}));

vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  councilDecreeEffect,
  finalizeCouncil,
  handleOracleCouncilVote,
  rehydrateCouncilDecree,
} from "../oracle-council";

function makeCouncil(votes: Record<string, string> = {}, status: "open" | "closed" = "open") {
  return {
    id: "test-council",
    guildId: "guild-1",
    channelId: "channel-1",
    messageId: "message-1",
    question: "Ce cale alegem?",
    options: [
      { id: "aur", label: "Aur", emoji: "🪙", decree: "Aurul domnește." },
      { id: "glorie", label: "Glorie", emoji: "👑", decree: "Gloria domnește." },
      { id: "taine", label: "Taine", emoji: "🔮", decree: "Tainele domnesc." },
    ],
    votes,
    openedAt: 1,
    closesAt: Date.now() + 60_000,
    status,
  };
}

function makeInteraction() {
  return {
    customId: "council_vote_test-council_aur",
    guildId: "guild-1",
    user: { id: "voter-1", username: "Vânător" },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    message: { edit: vi.fn().mockResolvedValue(undefined) },
  };
}

describe("Oracle Council vote handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges an accepted vote and immediately redraws the vote counts", async () => {
    const interaction = makeInteraction();
    const accepted = makeCouncil({ "voter-1": "aur" });
    mockCastOracleCouncilVote.mockResolvedValueOnce({ status: "accepted", council: accepted });
    mockRecordOracleInteraction.mockResolvedValueOnce(undefined);

    await handleOracleCouncilVote(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(interaction.message.edit).toHaveBeenCalledOnce();
    const messagePayload = interaction.message.edit.mock.calls[0]![0] as {
      embeds: Array<{ data: { fields: Array<{ value: string }> } }>;
    };
    expect(messagePayload.embeds[0]!.data.fields[0]!.value).toContain("1 glas");
    expect(interaction.editReply).toHaveBeenCalledWith("🕯️ Glasul tău a fost înscris în cronica Cenușii.");
  });

  it("confirms the vote even when relationship memory cannot be saved", async () => {
    const interaction = makeInteraction();
    mockCastOracleCouncilVote.mockResolvedValueOnce({
      status: "accepted",
      council: makeCouncil({ "voter-1": "aur" }),
    });
    mockRecordOracleInteraction.mockRejectedValueOnce(new Error("relationship store unavailable"));

    await handleOracleCouncilVote(interaction as never);

    expect(interaction.message.edit).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith("🕯️ Glasul tău a fost înscris în cronica Cenușii.");
  });

  it("does not redraw the message and explains that a second vote was rejected", async () => {
    const interaction = makeInteraction();
    mockCastOracleCouncilVote.mockResolvedValueOnce({ status: "already_voted" });

    await handleOracleCouncilVote(interaction as never);

    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith(
      "⚖️ Un singur glas pentru fiecare suflet. Urna ți-a primit deja alegerea.",
    );
  });

  it("returns a visible error when vote persistence fails unexpectedly", async () => {
    const interaction = makeInteraction();
    mockCastOracleCouncilVote.mockRejectedValueOnce(new Error("database unavailable"));

    await handleOracleCouncilVote(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith("❌ Glasul nu a putut fi înscris. Încearcă din nou.");
  });
});

describe("Oracle Council closing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the winning law while publishing the closed council", async () => {
    const closed = makeCouncil({ "voter-1": "aur", "voter-2": "aur" }, "closed");
    closed.closesAt = Date.now();
    mockCloseOracleCouncil.mockResolvedValueOnce(closed);
    mockSaveOracleCouncil.mockResolvedValueOnce(undefined);
    mockSaveOracleCouncilDecreeEffect.mockResolvedValueOnce(undefined);

    const message = { edit: vi.fn().mockResolvedValue(undefined) };
    const channel = Object.create(TextChannel.prototype) as TextChannel;
    channel.messages = { fetch: vi.fn().mockResolvedValue(message) } as never;
    channel.send = vi.fn().mockResolvedValue({ id: "result-message-1" });
    const client = { channels: { fetch: vi.fn().mockResolvedValue(channel) } };

    await finalizeCouncil(client as never, "guild-1", "test-council");

    expect(mockGrantGuildBoost).toHaveBeenCalledWith(
      "guild-1",
      1,
      1.25,
      expect.any(Number),
    );
    const grantedDuration = mockGrantGuildBoost.mock.calls[0]![3] as number;
    expect(grantedDuration).toBeGreaterThan(6 * 60 * 60 * 1000 - 1_000);
    expect(grantedDuration).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
    expect(mockSaveOracleCouncilDecreeEffect).toHaveBeenCalledWith({
      guildId: "guild-1",
      xpMult: 1,
      goldMult: 1.25,
      expiresAt: expect.any(Number),
    });
    expect(message.edit).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("Efectul legii") }),
    );
    expect(councilDecreeEffect("aur").goldMult).toBe(1.25);
  });

  it("rehydrates a still-active decree after a restart", async () => {
    mockLoadOracleCouncilDecreeEffect.mockResolvedValueOnce({
      guildId: "guild-1",
      xpMult: 1.25,
      goldMult: 1,
      expiresAt: Date.now() + 60_000,
    });
    mockRestoreGuildBoost.mockReturnValueOnce({
      xpMult: 1.25,
      goldMult: 1,
      expiresAt: Date.now() + 60_000,
    });

    await expect(rehydrateCouncilDecree("guild-1")).resolves.toBe(true);
    expect(mockRestoreGuildBoost).toHaveBeenCalledWith(
      "guild-1",
      1.25,
      1,
      expect.any(Number),
    );
  });

  it("does not restore an expired decree", async () => {
    mockLoadOracleCouncilDecreeEffect.mockResolvedValueOnce(null);

    await expect(rehydrateCouncilDecree("guild-1")).resolves.toBe(false);
    expect(mockRestoreGuildBoost).not.toHaveBeenCalled();
  });
});