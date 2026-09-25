import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mock references so they are available inside vi.mock factories ──────
// vi.mock is hoisted above import statements; vi.hoisted ensures these fn refs
// are initialised before any mock factory runs.
const { mockReturning, mockOnConflictDoUpdate } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflictDoUpdate = vi.fn();
  return { mockReturning, mockOnConflictDoUpdate };
});

// ── Mock @workspace/db ────────────────────────────────────────────────────────
// The real module throws at import time if DATABASE_URL is missing, and the
// drizzle chain would require a live PG connection. Replace it entirely.
vi.mock("@workspace/db", () => {
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  const mockDelete = vi.fn(() => ({ where: mockWhere }));
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  return {
    db: { insert: mockInsert, delete: mockDelete },
    // ensureBotStateTable() runs CREATE TABLE IF NOT EXISTS via pool.query before
    // every bot_state helper; resolve it so the helper logic under test runs.
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
    botStateTable: { key: "key_col", value: "value_col", updatedAt: "updated_at_col" },
    playersTable: {},
    activeEventsTable: {},
    eventParticipantsTable: {},
    eventClaimsTable: {},
  };
});

// ── Mock drizzle-orm ──────────────────────────────────────────────────────────
// eq() receives a mocked column object; the real implementation would fail.
// Since the entire db chain is mocked the actual SQL fragment is never used.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq-placeholder"),
  and: vi.fn(() => "and-placeholder"),
  gte: vi.fn(() => "gte-placeholder"),
  gt: vi.fn(() => "gt-placeholder"),
  inArray: vi.fn(() => "inArray-placeholder"),
  sql: Object.assign(vi.fn(() => "sql-placeholder"), { empty: "" }),
}));

// ── Mock ./survival (imported by db.ts; pulls in discord.js transitively) ─────
vi.mock("../survival", () => ({
  CLASSES: {},
  isClassKey: vi.fn(() => false),
  rollRarity: vi.fn(() => "common"),
  isCompanionKey: vi.fn(() => false),
  companionStats: vi.fn(() => ({ hp: 0, attack: 0, defense: 0, crit: 0 })),
}));

// Import after all vi.mock calls so mocks are already in place
import { recordOracleFellBack, consumeOracleFellBack } from "../db";

// ─────────────────────────────────────────────────────────────────────────────

const FAKE_ROW = { key: "oracle_fellback", value: "2025-01-01T00:00:00.000Z", updatedAt: new Date() };

describe("consumeOracleFellBack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no fallback marker exists (normal first-time full-mode boot)", async () => {
    mockReturning.mockResolvedValueOnce([]);

    const result = await consumeOracleFellBack();

    expect(result).toBe(false);
  });

  it("returns true exactly once after a marker has been recorded", async () => {
    mockReturning.mockResolvedValueOnce([FAKE_ROW]);

    const result = await consumeOracleFellBack();

    expect(result).toBe(true);
  });

  it("returns false on a second call (marker already deleted)", async () => {
    mockReturning
      .mockResolvedValueOnce([FAKE_ROW])
      .mockResolvedValueOnce([]);

    const first = await consumeOracleFellBack();
    const second = await consumeOracleFellBack();

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("concurrent consumes resolve to exactly one true (atomic DELETE … RETURNING)", async () => {
    // The DB-level DELETE … RETURNING is atomic: only the connection that
    // actually removes the row gets it back. Simulate this by having the mock
    // return a row on the first call and nothing on the second. Because JS is
    // single-threaded, Promise.all executes the synchronous setup of both calls
    // in order, so mockResolvedValueOnce slots are consumed in call-site order —
    // exactly mirroring what an atomic DB operation guarantees.
    mockReturning
      .mockResolvedValueOnce([FAKE_ROW])
      .mockResolvedValueOnce([]);

    const [a, b] = await Promise.all([consumeOracleFellBack(), consumeOracleFellBack()]);

    const trues = [a, b].filter(Boolean);
    const falses = [a, b].filter((r) => !r);
    expect(trues).toHaveLength(1);
    expect(falses).toHaveLength(1);
  });
});

describe("recordOracleFellBack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it("resolves without throwing", async () => {
    await expect(recordOracleFellBack()).resolves.toBeUndefined();
  });

  it("calls onConflictDoUpdate so repeated fallbacks are idempotent (upsert, not insert)", async () => {
    await recordOracleFellBack();
    await recordOracleFellBack();

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2);
  });
});
