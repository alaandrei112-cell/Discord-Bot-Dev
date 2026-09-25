---
name: Oracle reply-mode status
description: How the status page tells operators whether the Oracle answers every reply or only mentions/ping-replies.
---

# Oracle reply-mode surfacing

The `/api/healthz` response carries `oracleReplyMode` ("full" | "degraded") and
`oracleReplyReason` ("active" | "disabled" | "portal_toggle_missing"), derived in
`getOracleReplyMode()` from `ORACLE_MESSAGE_CONTENT_ENABLED` plus the module-level
`privilegedIntentFellBack` flag.

**Why:** "full" reply mode needs the privileged MessageContent intent, which the
4014 runtime fallback can silently drop. Operators previously had only a log line
/ one-time Discord alert. The status page now polls healthz and shows a header
badge so the live/degraded state is visible at a glance.

**How to apply:** The mode reflects *configured intent state*, not connectivity —
in dev the bot doesn't run (prod-only) yet healthz still reports "full" when the
env flag is on. Bot online/offline is a separate signal (Discord stats widget /
botOnline). Don't conflate them. The reason distinguishes operator-disabled from
portal-toggle-missing (the 4014 fallback).
