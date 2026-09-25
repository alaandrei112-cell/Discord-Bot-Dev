import { useState, useCallback, useEffect } from "react";
import { API_BASE } from "../../lib/public-constants";

export interface OracleHealth {
  reachable: boolean;
  botOnline: boolean;
  shardStatus: string | null;
  botUptime: number;
  oracleReplyMode: "full" | "degraded";
  oracleReplyReason: "active" | "disabled" | "portal_toggle_missing";
  alertsConfigured: boolean;
  alertThresholdMs: number;
}

export function useOracleHealth() {
  const [health, setHealth] = useState<OracleHealth | null>(null);
  
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/healthz`);
      if (!response.ok) throw new Error("bad response");
      const data = await response.json();
      setHealth({
        reachable: true,
        botOnline: Boolean(data.botOnline),
        shardStatus: typeof data.shardStatus === "string" ? data.shardStatus : null,
        botUptime: typeof data.botUptime === "number" ? data.botUptime : 0,
        oracleReplyMode: data.oracleReplyMode === "full" ? "full" : "degraded",
        oracleReplyReason: data.oracleReplyReason === "active" || data.oracleReplyReason === "portal_toggle_missing" ? data.oracleReplyReason : "disabled",
        alertsConfigured: Boolean(data.alertsConfigured),
        alertThresholdMs: typeof data.alertThresholdMs === "number" ? data.alertThresholdMs : 300_000,
      });
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = window.setInterval(() => void fetchHealth(), 15_000);
    return () => window.clearInterval(interval);
  }, [fetchHealth]);

  return health;
}
