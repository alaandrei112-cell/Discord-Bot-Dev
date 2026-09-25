import { logger } from "../lib/logger";

export const DISCONNECT_ALERT_THRESHOLD_MS = (() => {
  const raw = process.env["DISCONNECT_ALERT_THRESHOLD_MS"];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60_000;
})();

export function isAlertsConfigured(): boolean {
  return Boolean(process.env["DISCORD_ALERT_WEBHOOK_URL"]);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export async function sendRecoveryAlert(outageStartedAt: Date): Promise<void> {
  const downtimeMs = Date.now() - outageStartedAt.getTime();
  const duration = formatDuration(downtimeMs);
  await sendAlert(`✅ **Bot is back online** after being offline for **${duration}**.`);
}

export async function sendAlert(message: string): Promise<void> {
  const webhookUrl = process.env["DISCORD_ALERT_WEBHOOK_URL"];
  if (!webhookUrl) {
    logger.warn("DISCORD_ALERT_WEBHOOK_URL not configured — alert suppressed");
    return;
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    if (res.ok) {
      logger.info({ message }, "Disconnect alert sent");
    } else {
      logger.error({ status: res.status, message }, "Disconnect alert request failed");
    }
  } catch (err) {
    logger.error({ err, message }, "Disconnect alert fetch threw");
  }
}
