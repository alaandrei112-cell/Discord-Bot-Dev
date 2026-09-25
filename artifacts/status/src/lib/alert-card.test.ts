import { describe, it, expect } from "vitest";
import { computeAlertCard } from "./alert-card";

describe("computeAlertCard", () => {
  it("returns loading state when health is null", () => {
    const result = computeAlertCard(null);
    expect(result.tone).toBe("loading");
    expect(result.label).toBe("Se verifică…");
  });

  it("returns ok/green when alertsConfigured is true — 5m threshold", () => {
    const result = computeAlertCard({ alertsConfigured: true, alertThresholdMs: 300_000 });
    expect(result.tone).toBe("ok");
    expect(result.label).toBe("Alerte: ACTIVE");
    expect(result.detail).toContain("5m");
    expect(result.detail).toContain("Webhook configurat");
  });

  it("formats threshold as minutes when >= 60 seconds", () => {
    const result = computeAlertCard({ alertsConfigured: true, alertThresholdMs: 120_000 });
    expect(result.tone).toBe("ok");
    expect(result.detail).toContain("2m");
  });

  it("formats threshold as seconds when < 60 seconds", () => {
    const result = computeAlertCard({ alertsConfigured: true, alertThresholdMs: 30_000 });
    expect(result.tone).toBe("ok");
    expect(result.detail).toContain("30s");
  });

  it("formats threshold as seconds for exactly 59 seconds", () => {
    const result = computeAlertCard({ alertsConfigured: true, alertThresholdMs: 59_000 });
    expect(result.tone).toBe("ok");
    expect(result.detail).toContain("59s");
  });

  it("formats threshold as minutes for exactly 60 seconds", () => {
    const result = computeAlertCard({ alertsConfigured: true, alertThresholdMs: 60_000 });
    expect(result.tone).toBe("ok");
    expect(result.detail).toContain("1m");
  });

  it("returns danger/red when alertsConfigured is false", () => {
    const result = computeAlertCard({ alertsConfigured: false, alertThresholdMs: 300_000 });
    expect(result.tone).toBe("danger");
    expect(result.label).toBe("Alerte: OPRITE");
    expect(result.detail).toContain("DISCORD_ALERT_WEBHOOK_URL");
  });
});
