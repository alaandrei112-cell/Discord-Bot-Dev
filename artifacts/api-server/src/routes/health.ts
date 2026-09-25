import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isBotOnline, getBotReadyAt, getShardStatus, getOracleReplyMode } from "../bot/index";
import { isAlertsConfigured, DISCONNECT_ALERT_THRESHOLD_MS } from "../bot/alert";
import { JUSTICE_WINDOW_MINUTES, JUSTICE_SCAN_LIMIT } from "../bot/oracle-guard";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", (_req, res) => {
  const botOnline = isBotOnline();
  const botReadyAt = getBotReadyAt();
  const botUptime = botReadyAt && botOnline
    ? Math.floor((Date.now() - botReadyAt.getTime()) / 1000)
    : 0;
  const oracleReply = getOracleReplyMode();
  const data = HealthCheckResponse.parse({
    status: "ok",
    botOnline,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    botReadyAt: botReadyAt ? botReadyAt.toISOString() : null,
    botUptime,
    shardStatus: getShardStatus(),
    oracleReplyMode: oracleReply.mode,
    oracleReplyReason: oracleReply.reason,
    alertsConfigured: isAlertsConfigured(),
    alertThresholdMs: DISCONNECT_ALERT_THRESHOLD_MS,
    justiceWindowMinutes: JUSTICE_WINDOW_MINUTES,
    justiceScanLimit: JUSTICE_SCAN_LIMIT,
  });
  res.status(200).json(data);
});

export default router;
