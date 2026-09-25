import { pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { startBot, destroyBotClientForShutdown } from "./bot/index";
import { sendAlert, sendRecoveryAlert, DISCONNECT_ALERT_THRESHOLD_MS } from "./bot/alert";

// Warm the DB connection pool at boot so the first slash command isn't delayed
// by a cold TLS handshake — that latency can otherwise push interaction replies
// past Discord's 3s deadline (DiscordAPIError 10062 "Unknown interaction").
void pool
  .query("SELECT 1")
  .then(() => logger.info("DB pool warmed"))
  .catch((err: unknown) => logger.error({ err }, "DB pool warmup failed"));

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — process continues");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — process continues");
});

// Fast, clean shutdown on redeploy: disconnect the Discord gateway session
// immediately so the old VM never lingers as a second bot instance racing the
// new one to acknowledge interactions (40060/10062 → laggy bot).
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received — disconnecting bot and exiting");
  // Hard deadline: exit even if cleanup hangs.
  const deadline = setTimeout(() => process.exit(0), 3_000);
  deadline.unref?.();
  void (async () => {
    try {
      await destroyBotClientForShutdown();
    } catch (err) {
      logger.warn({ err }, "Error while destroying bot client during shutdown");
    }
    try {
      await pool.end();
    } catch {
      // pool may already be closed — ignore
    }
    process.exit(0);
  })();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

const BOT_RETRY_BASE_MS = 2_000;
const BOT_RETRY_MAX_MS = 5 * 60_000;
// If the bot ran stably for this long before dying, reset the back-off counter
// so a transient runtime disconnect doesn't inherit a multi-minute delay.
const BOT_STABLE_THRESHOLD_MS = 60_000;

async function startBotWithRetry() {
  let attempt = 0;
  let supervisorAlertTimer: ReturnType<typeof setTimeout> | null = null;
  let supervisorOutageStartedAt: Date | null = null;

  function scheduleSupervisorAlert(currentAttempt: number) {
    if (supervisorAlertTimer) return; // already scheduled
    const thresholdMin = Math.round(DISCONNECT_ALERT_THRESHOLD_MS / 60_000);
    supervisorAlertTimer = setTimeout(() => {
      supervisorAlertTimer = null;
      void sendAlert(
        `🚨 **Bot has been failing to reconnect for over ${thresholdMin} minute${thresholdMin === 1 ? "" : "s"}** (${currentAttempt} restart attempt${currentAttempt === 1 ? "" : "s"}).\nCheck server logs — the bot supervisor is still retrying with back-off.`,
      );
    }, DISCONNECT_ALERT_THRESHOLD_MS);
  }

  // Cancel a pending supervisor alert (bot came back within threshold) or send
  // a recovery alert if the outage alert already fired.
  // supervisorOutageStartedAt set + timer pending  → alert not sent yet, suppress it
  // supervisorOutageStartedAt set + timer null     → alert already sent, send recovery
  function cancelSupervisorAlert() {
    if (supervisorAlertTimer) {
      clearTimeout(supervisorAlertTimer);
      supervisorAlertTimer = null;
      supervisorOutageStartedAt = null;
      logger.info("Supervisor alert suppressed — bot restarted within threshold");
    } else if (supervisorOutageStartedAt) {
      const startedAt = supervisorOutageStartedAt;
      supervisorOutageStartedAt = null;
      logger.info("Sending supervisor recovery alert — bot restarted after outage");
      void sendRecoveryAlert(startedAt);
    }
  }

  while (true) {
    const connectTime = Date.now();
    try {
      await startBot(() => {
        // Bot is ready after a restart — cancel or recover from the supervisor
        // alert depending on whether it already fired.
        cancelSupervisorAlert();
      });
      // startBot() resolved without error = DISCORD_TOKEN not set, or this
      // instance yielded leadership to a newer one; stop looping either way.
      return;
    } catch (err) {
      const uptimeMs = Date.now() - connectTime;
      if (uptimeMs >= BOT_STABLE_THRESHOLD_MS) {
        // Bot ran successfully long enough — treat this as a fresh failure.
        attempt = 0;
        cancelSupervisorAlert();
      }

      attempt++;
      const delay = Math.min(BOT_RETRY_BASE_MS * Math.pow(2, attempt - 1), BOT_RETRY_MAX_MS);
      logger.error({ err, attempt, delayMs: delay, uptimeMs }, "Bot terminated — restarting with back-off");

      // Record the start of this outage window on the first failure only
      // (subsequent retries within the same window leave the timer running).
      if (!supervisorAlertTimer && !supervisorOutageStartedAt) {
        supervisorOutageStartedAt = new Date();
      }

      // Schedule the alert timer on the first failure of this outage window.
      // It fires after the threshold regardless of how many retries happen in between.
      scheduleSupervisorAlert(attempt);

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

if (process.env.NODE_ENV === "production") {
  startBotWithRetry();
} else {
  logger.info("Bot disabled in development mode — set NODE_ENV=production to enable");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
