import { describe, it, expect } from "vitest";
import { checkBossHitCooldown, BOSS_HIT_COOLDOWN_MS } from "../scheduler";

// ─── checkBossHitCooldown — pure cooldown guard ───────────────────────────────
//
// Tests use the optional `now` parameter to inject a fake clock so no
// Date.now() mocking is required and tests stay deterministic.

describe("checkBossHitCooldown — first hit (no prior entry)", () => {
  it("is not on cooldown when the player has never hit", () => {
    const lastHitAt = new Map<string, number>();
    const result = checkBossHitCooldown(lastHitAt, "alice");
    expect(result.onCooldown).toBe(false);
  });

  it("treats a missing lastHitAt entry the same as a hit at epoch 0 (always expired)", () => {
    const lastHitAt = new Map<string, number>();
    const now = BOSS_HIT_COOLDOWN_MS + 1;
    const result = checkBossHitCooldown(lastHitAt, "alice", now);
    expect(result.onCooldown).toBe(false);
  });
});

describe("checkBossHitCooldown — second click within the 4-second window is rejected", () => {
  it("returns onCooldown:true when elapsed = 0ms (same instant)", () => {
    const now = 100_000;
    const lastHitAt = new Map([["alice", now]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", now);
    expect(result.onCooldown).toBe(true);
  });

  it("returns onCooldown:true when elapsed = 1ms", () => {
    const hitAt = 100_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + 1);
    expect(result.onCooldown).toBe(true);
  });

  it("returns onCooldown:true when elapsed = BOSS_HIT_COOLDOWN_MS - 1 (one ms before expiry)", () => {
    const hitAt = 100_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + BOSS_HIT_COOLDOWN_MS - 1);
    expect(result.onCooldown).toBe(true);
  });

  it("reports remainingSeconds = 4 immediately after a hit", () => {
    const now = 200_000;
    const lastHitAt = new Map([["alice", now]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", now);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(4);
  });

  it("reports remainingSeconds = 1 when 3001ms have elapsed (ceiling division)", () => {
    const hitAt = 200_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    // elapsed = 3001ms; remaining = 4000 - 3001 = 999ms → ceil(999/1000) = 1
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + 3001);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(1);
  });

  it("reports remainingSeconds = 2 when 2001ms have elapsed", () => {
    const hitAt = 200_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    // elapsed = 2001ms; remaining = 4000 - 2001 = 1999ms → ceil(1999/1000) = 2
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + 2001);
    expect(result.onCooldown).toBe(true);
    if (result.onCooldown) expect(result.remainingSeconds).toBe(2);
  });
});

describe("checkBossHitCooldown — click after the cooldown window is accepted", () => {
  it("returns onCooldown:false when elapsed = BOSS_HIT_COOLDOWN_MS exactly", () => {
    const hitAt = 100_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + BOSS_HIT_COOLDOWN_MS);
    expect(result.onCooldown).toBe(false);
  });

  it("returns onCooldown:false when elapsed = BOSS_HIT_COOLDOWN_MS + 1", () => {
    const hitAt = 100_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + BOSS_HIT_COOLDOWN_MS + 1);
    expect(result.onCooldown).toBe(false);
  });

  it("returns onCooldown:false for a long time after the last hit (60s later)", () => {
    const hitAt = 100_000;
    const lastHitAt = new Map([["alice", hitAt]]);
    const result = checkBossHitCooldown(lastHitAt, "alice", hitAt + 60_000);
    expect(result.onCooldown).toBe(false);
  });
});

describe("checkBossHitCooldown — cooldowns are per-player, not shared", () => {
  it("alice on cooldown does not affect bob (bob has no entry)", () => {
    const now = 100_000;
    const lastHitAt = new Map([["alice", now]]);
    const aliceResult = checkBossHitCooldown(lastHitAt, "alice", now);
    const bobResult   = checkBossHitCooldown(lastHitAt, "bob",   now);
    expect(aliceResult.onCooldown).toBe(true);
    expect(bobResult.onCooldown).toBe(false);
  });

  it("two players can be on cooldown independently at different remaining times", () => {
    const base = 100_000;
    const lastHitAt = new Map([
      ["alice", base],         // hit at T=0
      ["bob",   base + 2000],  // hit at T+2s
    ]);
    const now = base + 3000; // T+3s

    const aliceResult = checkBossHitCooldown(lastHitAt, "alice", now);
    const bobResult   = checkBossHitCooldown(lastHitAt, "bob",   now);

    // alice: elapsed 3000ms, remaining 1000ms → ceil = 1s
    expect(aliceResult.onCooldown).toBe(true);
    if (aliceResult.onCooldown) expect(aliceResult.remainingSeconds).toBe(1);

    // bob: elapsed 1000ms, remaining 3000ms → ceil = 3s
    expect(bobResult.onCooldown).toBe(true);
    if (bobResult.onCooldown) expect(bobResult.remainingSeconds).toBe(3);
  });

  it("player whose cooldown expired can hit again while another is still on cooldown", () => {
    const base = 100_000;
    const lastHitAt = new Map([
      ["alice", base],          // hit early — cooldown expired
      ["bob",   base + 5000],   // hit later — still on cooldown
    ]);
    const now = base + 6000;

    // alice: elapsed 6000ms >= 4000ms → not on cooldown
    const aliceResult = checkBossHitCooldown(lastHitAt, "alice", now);
    expect(aliceResult.onCooldown).toBe(false);

    // bob: elapsed 1000ms < 4000ms → on cooldown
    const bobResult = checkBossHitCooldown(lastHitAt, "bob", now);
    expect(bobResult.onCooldown).toBe(true);
  });
});

describe("checkBossHitCooldown — BOSS_HIT_COOLDOWN_MS constant is 4 seconds", () => {
  it("BOSS_HIT_COOLDOWN_MS equals 4000ms", () => {
    expect(BOSS_HIT_COOLDOWN_MS).toBe(4000);
  });
});
