import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../../lib/public-constants";

export interface DailyStatsReport {
  guildId: string;
  day: string;
  metrics: {
    messages: number;
    uniqueUsers: number;
    boosts: number;
    joins: number;
    leaves: number;
    peakVoice: number;
  };
  activity: Array<{ day: string; messages: number }>;
  topChannels: Array<{ channelId: string; channelName: string; messages: number }>;
}

export interface DailyStatsResponse {
  guildName: string;
  timezone: string;
  report: DailyStatsReport;
}

export function useDailyStats() {
  const [data, setData] = useState<DailyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/discord/daily-stats`);
      if (!response.ok) throw new Error("Raportul nu este disponibil momentan.");
      setData(await response.json() as DailyStatsResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Raportul nu este disponibil momentan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}