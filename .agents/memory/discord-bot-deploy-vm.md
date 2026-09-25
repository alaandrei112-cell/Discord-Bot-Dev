---
name: Discord bot must deploy as Reserved VM
description: Why this Discord bot has to be a Reserved VM deployment, not Autoscale, and how the symptom presents.
---

# Discord bot must deploy as Reserved VM (not Autoscale)

The bot (api-server, prod-only) MUST be published as **Reserved VM** (`vm`,
always-on). **Autoscale is wrong for it** and was the cause of "the bot replied
once, then stopped".

**Why:** Autoscale scales the process to zero when there's no inbound HTTP
traffic. When the process sleeps, the Discord gateway WebSocket drops, so the bot
stops receiving mentions/replies AND the in-process scheduler (Oracle ticks, chest
spawns, battle events, blessings) stops firing. It briefly wakes only when an HTTP
request (e.g. the status page polling `/api/healthz`) hits it, so behavior looks
random/intermittent. Autoscale can also run multiple instances → duplicate replies
and double scheduler runs, which breaks the in-memory locks (e.g. fireChest).

**Symptom signature in deployment logs:** a burst of normal activity right after a
republish, then a flat gap — NO scheduler ticks/chests/events for long stretches.
A healthy always-on bot emits scheduled activity continuously.

**How to apply:** the deployment type is set in `.replit` `[deployment]
deploymentTarget` but CANNOT be changed programmatically by the agent — the user
must switch it to "Reserved VM" in the Deployments/Publish pane and republish.
Reserved VM is always-on and costs a fixed monthly amount (more than Autoscale's
pay-per-use); that tradeoff is unavoidable for an always-connected Discord bot.
