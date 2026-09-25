import { describe, it, expect, vi } from "vitest";

// ── Mock the logger so test output is clean ───────────────────────────────────
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks are registered
import { shouldYieldLeadership } from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// The single-instance guard: each bot process claims the bot_instance marker at
// startup (last writer wins) and periodically re-checks it. It must yield ONLY
// when the marker belongs to a different process.

describe("shouldYieldLeadership", () => {
  const ME = "11111111-1111-1111-1111-111111111111";
  const OTHER = "22222222-2222-2222-2222-222222222222";

  it("does NOT yield when the marker is ours", () => {
    expect(shouldYieldLeadership(ME, ME)).toBe(false);
  });

  it("yields when a different instance holds the marker", () => {
    expect(shouldYieldLeadership(OTHER, ME)).toBe(true);
  });

  it("does NOT yield when the marker is missing (null holder)", () => {
    expect(shouldYieldLeadership(null, ME)).toBe(false);
  });

  it("yields on an empty-string holder (foreign non-null value)", () => {
    // An empty string is still a foreign (non-null) value distinct from ours —
    // treat it as a foreign claim to stay on the safe side of "two bots racing".
    expect(shouldYieldLeadership("", ME)).toBe(true);
  });
});
