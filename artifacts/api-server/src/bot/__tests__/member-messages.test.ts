import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildMember } from "discord.js";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getGameplayConfig: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock("../gameplay-store", () => ({
  getGameplayConfig: mocks.getGameplayConfig,
}));

import { buildMemberMessagePrompt, sendAiMemberMessage } from "../member-messages";

const configuredMemberMessages = {
  welcomeEnabled: true,
  leaveEnabled: true,
  channelId: "44444444444444444",
  style: "medieval" as const,
  customStyle: "",
};

function createMember() {
  const send = vi.fn().mockResolvedValue({});
  const channel = { isTextBased: () => true, send };
  const fetch = vi.fn().mockResolvedValue(channel);
  const member = {
    id: "55555555555555555",
    user: { bot: false },
    guild: { id: "11111111111111111", channels: { fetch } },
  } as unknown as GuildMember;
  return { member, send, fetch };
}

describe("AI-generated member messages", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    mocks.create.mockReset().mockResolvedValue({
      choices: [{ message: { content: "Bine ai venit, călător! @everyone" } }],
    });
    mocks.getGameplayConfig.mockReset().mockReturnValue({
      memberMessages: { ...configuredMemberMessages },
    });
  });

  it("generates a fresh welcome in the selected style and adds a safe Discord mention", async () => {
    const { member, send, fetch } = createMember();

    await expect(sendAiMemberMessage(member, "welcome")).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledWith(configuredMemberMessages.channelId);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "system", content: expect.stringContaining("ton medieval") }],
      }),
      expect.objectContaining({ timeout: 15_000, maxRetries: 1 }),
    );
    expect(send).toHaveBeenCalledWith({
      content: "<@55555555555555555> Bine ai venit, călător!",
      allowedMentions: { parse: [], users: ["55555555555555555"] },
    });
  });

  it("uses a separate farewell prompt for member departures", () => {
    expect(buildMemberMessagePrompt("leave", "normal", "")).toContain("a părăsit serverul");
    expect(buildMemberMessagePrompt("welcome", "custom", "ton de basm")).toContain("ton de basm");
  });

  it("does not call AI or fetch a channel for a disabled event", async () => {
    const { member, fetch } = createMember();
    mocks.getGameplayConfig.mockReturnValue({
      memberMessages: { ...configuredMemberMessages, welcomeEnabled: false },
    });

    await expect(sendAiMemberMessage(member, "welcome")).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});