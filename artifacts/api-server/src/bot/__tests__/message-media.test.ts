import { afterEach, describe, expect, it } from "vitest";
import { messageWithImage, normalizeMessageImageUrl, publicMessageImageUrl } from "../message-media";
import { normalizeGameplayConfig } from "../gameplay-config";
import { DEFAULT_VERIFICATION_CONFIG, normalizeVerificationConfig, verificationPanel } from "../verification";

describe("editable Discord message images", () => {
  afterEach(() => {
    delete process.env.REPLIT_DOMAINS;
  });

  it("accepts HTTPS and uploaded paths while rejecting unsafe URL schemes", () => {
    expect(normalizeMessageImageUrl("https://cdn.example.test/banner.png")).toBe("https://cdn.example.test/banner.png");
    expect(normalizeMessageImageUrl("/api/storage/objects/uploads/banner")).toBe("/api/storage/objects/uploads/banner");
    expect(normalizeMessageImageUrl("javascript:alert(1)")).toBe("");
    expect(normalizeMessageImageUrl("http://insecure.example.test/banner.png")).toBe("");
  });

  it("round-trips both paused-message media slots and renders them together", () => {
    process.env.REPLIT_DOMAINS = "status.example.test";
    const config = normalizeGameplayConfig({
      messages: {
        gamePaused: "Pauză",
        oraclePaused: "Oracol oprit",
        gamePausedImageUrl: "/api/storage/objects/uploads/game",
        gamePausedThumbnailUrl: "https://cdn.example.test/game-thumb.png",
        oraclePausedImageUrl: "https://cdn.example.test/oracle.png",
        oraclePausedThumbnailUrl: "",
      },
    });
    expect(config.messages.gamePausedImageUrl).toBe("/api/storage/objects/uploads/game");
    const embed = messageWithImage(
      config.messages.gamePaused,
      config.messages.gamePausedImageUrl,
      config.messages.gamePausedThumbnailUrl,
    ).embeds?.[0]?.toJSON();
    expect(embed?.image?.url).toBe("https://status.example.test/api/storage/objects/uploads/game");
    expect(embed?.thumbnail?.url).toBe("https://cdn.example.test/game-thumb.png");
    expect(publicMessageImageUrl(config.messages.oraclePausedImageUrl)).toBe("https://cdn.example.test/oracle.png");
  });

  it("puts independent verification image and thumbnail on the published embed", () => {
    const config = normalizeVerificationConfig({
      ...DEFAULT_VERIFICATION_CONFIG,
      imageUrl: "https://cdn.example.test/verification.png",
      thumbnailUrl: "https://cdn.example.test/verification-thumb.png",
    });
    const embed = verificationPanel(config).embeds[0]?.toJSON();
    expect(embed.image?.url).toBe("https://cdn.example.test/verification.png");
    expect(embed.thumbnail?.url).toBe("https://cdn.example.test/verification-thumb.png");
  });

  it("clears either media slot without clearing the other", () => {
    const config = normalizeVerificationConfig({
      ...DEFAULT_VERIFICATION_CONFIG,
      imageUrl: "",
      thumbnailUrl: "https://cdn.example.test/thumb.png",
    });
    const embed = verificationPanel(config).embeds[0]?.toJSON();
    expect(embed.image).toBeUndefined();
    expect(embed.thumbnail?.url).toBe("https://cdn.example.test/thumb.png");
  });
});