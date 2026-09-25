import { describe, expect, it } from "vitest";
import { botControlSchema } from "../router";
import { DEFAULT_GAMEPLAY_CONFIG } from "../../bot/gameplay-config";

const validPayload = () => ({
  channels: {},
  allianceRecruitmentText: "Mesaj",
  gameplayConfig: structuredClone(DEFAULT_GAMEPLAY_CONFIG),
});

describe("owner gameplay configuration limits", () => {
  it.each([
    ["event duration", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.events.eventDurationMinutes = 0; }],
    ["mission target", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.missions.kill_10.target = 10_001; }],
    ["mission reward", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.missions.rare_3.rewardQty = 101; }],
    ["economy multiplier", (p: ReturnType<typeof validPayload>) => { p.gameplayConfig.economy.bossGoldMultiplier = 10.1; }],
  ])("rejects %s outside the allowed range", (_label, mutate) => {
    const payload = validPayload();
    mutate(payload);
    expect(() => botControlSchema.parse(payload)).toThrow();
  });

  it("rejects inverted min/max intervals", () => {
    const payload = validPayload();
    payload.gameplayConfig.events.eventCooldownMinMinutes = 20;
    payload.gameplayConfig.events.eventCooldownMaxMinutes = 10;
    expect(() => botControlSchema.parse(payload)).toThrow();
  });

  it("accepts the default profile and preserves all gameplay sections", () => {
    const parsed = botControlSchema.parse(validPayload());
    expect(parsed.gameplayConfig).toEqual(DEFAULT_GAMEPLAY_CONFIG);
  });

  it("accepts an empty alliance override returned by a fresh configuration", () => {
    const payload = validPayload();
    payload.allianceRecruitmentText = "";
    expect(botControlSchema.parse(payload).allianceRecruitmentText).toBe("");
  });

  it("round-trips safe message image fields and rejects unsafe image URLs", () => {
    const payload = validPayload();
    payload.gameplayConfig.messages.gamePausedImageUrl = "/api/storage/objects/uploads/game-paused";
    payload.gameplayConfig.messages.gamePausedThumbnailUrl = "https://cdn.example.test/game-thumb.png";
    payload.gameplayConfig.messages.oraclePausedImageUrl = "https://cdn.example.test/oracle.png";
    payload.gameplayConfig.messages.oraclePausedThumbnailUrl = "";
    expect(botControlSchema.parse(payload).gameplayConfig.messages).toMatchObject({
      gamePausedImageUrl: "/api/storage/objects/uploads/game-paused",
      gamePausedThumbnailUrl: "https://cdn.example.test/game-thumb.png",
      oraclePausedImageUrl: "https://cdn.example.test/oracle.png",
      oraclePausedThumbnailUrl: "",
    });
    payload.gameplayConfig.messages.gamePausedImageUrl = "";
    payload.gameplayConfig.messages.gamePausedThumbnailUrl = "javascript:alert(1)";
    expect(() => botControlSchema.parse(payload)).toThrow();
  });
});