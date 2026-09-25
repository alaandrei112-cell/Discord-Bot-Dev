import { useState, useCallback, useEffect } from "react";
import { API_BASE } from "../../lib/public-constants";

export interface DiscordStats {
  live: boolean;
  onlineCount: number | null;
  totalMembers: number | null;
  lastJoined: string | null;
}

export function useSoulStoneStats() {
  const [stats, setStats] = useState<DiscordStats | null>(null);
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/discord/stats`);
      if (!response.ok) throw new Error("bad response");
      setStats(await response.json() as DiscordStats);
    } catch {
      setStats({ live: false, onlineCount: null, totalMembers: null, lastJoined: null });
    }
  }, []);
  
  useEffect(() => {
    void fetchStats();
    const interval = window.setInterval(() => void fetchStats(), 10_000);
    return () => window.clearInterval(interval);
  }, [fetchStats]);
  
  return stats;
}
