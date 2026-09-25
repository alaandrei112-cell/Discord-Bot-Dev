import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, playersTable } from "@workspace/db";
import { getBotClient, GUILD_ID, isBotOnline } from "../bot/index";
import { fetchDiscordGuildStats, fetchDiscordGuildStatsViaRest } from "./discord-stats";
import { completedStatsDay, getDailyStats } from "../bot/daily-stats";

const router: IRouter = Router();

router.get("/discord/daily-stats", async (req, res) => {
  const requestedDay = typeof req.query.day === "string" ? req.query.day : completedStatsDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDay)) {
    res.status(400).json({ error: "day must use YYYY-MM-DD" });
    return;
  }

  try {
    const report = await getDailyStats(GUILD_ID, requestedDay);
    const guildName = getBotClient()?.guilds.cache.get(GUILD_ID)?.name ?? "Regatul Cenușii";
    res.status(200).json({
      guildName,
      timezone: process.env.DISCORD_STATS_TIMEZONE || "Europe/Bucharest",
      report,
    });
  } catch (err) {
    req.log.error({ err, day: requestedDay }, "Failed to fetch daily Discord statistics");
    res.status(503).json({ error: "Daily statistics are not available yet" });
  }
});

router.get("/discord/stats", async (req, res) => {
  const client = getBotClient();

  // Fetch most recently registered player from DB (reliable, no privileged intents needed)
  let lastJoined: string | null = null;
  try {
    const [newest] = await db
      .select({ username: playersTable.username })
      .from(playersTable)
      .orderBy(desc(playersTable.createdAt))
      .limit(1);
    lastJoined = newest?.username ?? null;
  } catch {
    // DB unavailable — lastJoined stays null
  }

  if (!client || !isBotOnline()) {
    // Development intentionally does not open a Discord Gateway session, so
    // use the REST count endpoint for the landing-page preview instead.
    try {
      const { onlineCount, totalMembers } = await fetchDiscordGuildStatsViaRest(
        process.env.DISCORD_TOKEN,
        GUILD_ID,
      );
      res.status(200).json({
        live: true,
        onlineCount,
        totalMembers,
        lastJoined,
      });
      return;
    } catch (err) {
      req.log.debug({ err }, "Discord gateway offline and REST stats unavailable");
    }

    res.status(200).json({
      live: false,
      onlineCount: null,
      totalMembers: null,
      lastJoined,
    });
    return;
  }

  try {
    const { onlineCount, totalMembers } = await fetchDiscordGuildStats(client, GUILD_ID);

    res.status(200).json({
      live: true,
      onlineCount,
      totalMembers,
      lastJoined,
    });
  } catch (err) {
    req.log.warn({ err }, "Failed to fetch Discord guild stats");
    res.status(200).json({
      live: false,
      onlineCount: null,
      totalMembers: null,
      lastJoined,
    });
  }
});

export default router;
