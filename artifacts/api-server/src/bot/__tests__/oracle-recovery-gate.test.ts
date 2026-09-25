import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the logger so test output is clean ───────────────────────────────────
vi.mock("../../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks are registered
import { maybeAlertOracleRecovery } from "../index";
import type { OracleReplyMode } from "../index";

// ─────────────────────────────────────────────────────────────────────────────

function makeMode(mode: "full" | "degraded", reason: OracleReplyMode["reason"] = "active"): () => OracleReplyMode {
  return () => ({ mode, reason });
}

// Typed wrappers so vi.fn() mocks satisfy the concrete function signatures that
// maybeAlertOracleRecovery expects without unsafe "as" casts.
function makeConsumeMarker(result: boolean): () => Promise<boolean> {
  return vi.fn<() => Promise<boolean>>().mockResolvedValue(result) as unknown as () => Promise<boolean>;
}

function makeAlert(): [() => Promise<unknown>, ReturnType<typeof vi.fn>] {
  const fn = vi.fn<(msg: string) => Promise<void>>().mockResolvedValue(undefined);
  return [fn as unknown as () => Promise<unknown>, fn];
}

describe("maybeAlertOracleRecovery — ClientReady gate", () => {
  let consumeMarkerFn: ReturnType<typeof vi.fn>;
  let alertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends alert when mode is full AND a marker existed", async () => {
    consumeMarkerFn = vi.fn().mockResolvedValue(true);
    alertFn = vi.fn().mockResolvedValue(undefined);

    await maybeAlertOracleRecovery(
      makeMode("full"),
      consumeMarkerFn as () => Promise<boolean>,
      alertFn as (msg: string) => Promise<unknown>,
    );

    expect(consumeMarkerFn).toHaveBeenCalledOnce();
    expect(alertFn).toHaveBeenCalledOnce();
  });

  it("does NOT send alert when mode is full but no marker was recorded (normal first-time full-mode boot)", async () => {
    consumeMarkerFn = vi.fn().mockResolvedValue(false);
    alertFn = vi.fn().mockResolvedValue(undefined);

    await maybeAlertOracleRecovery(
      makeMode("full"),
      consumeMarkerFn as () => Promise<boolean>,
      alertFn as (msg: string) => Promise<unknown>,
    );

    expect(consumeMarkerFn).toHaveBeenCalledOnce();
    expect(alertFn).not.toHaveBeenCalled();
  });

  it("does NOT send alert when mode is degraded, even if a marker exists", async () => {
    consumeMarkerFn = vi.fn().mockResolvedValue(true);
    alertFn = vi.fn().mockResolvedValue(undefined);

    await maybeAlertOracleRecovery(
      makeMode("degraded", "portal_toggle_missing"),
      consumeMarkerFn as () => Promise<boolean>,
      alertFn as (msg: string) => Promise<unknown>,
    );

    expect(alertFn).not.toHaveBeenCalled();
  });

  it("does NOT consume the marker when mode is degraded (short-circuit preserves it for the real full-mode boot)", async () => {
    consumeMarkerFn = vi.fn().mockResolvedValue(true);
    alertFn = vi.fn().mockResolvedValue(undefined);

    await maybeAlertOracleRecovery(
      makeMode("degraded", "disabled"),
      consumeMarkerFn as () => Promise<boolean>,
      alertFn as (msg: string) => Promise<unknown>,
    );

    expect(consumeMarkerFn).not.toHaveBeenCalled();
  });

  it("does NOT send alert when mode is degraded and no marker exists", async () => {
    consumeMarkerFn = vi.fn().mockResolvedValue(false);
    alertFn = vi.fn().mockResolvedValue(undefined);

    await maybeAlertOracleRecovery(
      makeMode("degraded", "disabled"),
      consumeMarkerFn as () => Promise<boolean>,
      alertFn as (msg: string) => Promise<unknown>,
    );

    expect(alertFn).not.toHaveBeenCalled();
    expect(consumeMarkerFn).not.toHaveBeenCalled();
  });
});
