---
name: DB pool sizing & Discord interaction latency
description: Why the pg Pool defaults cause 10062 "Unknown interaction" under concurrent button clicks, and how to size it.
---

The default `pg` `Pool` (`max: 10`, no `connectionTimeoutMillis`) is a hidden cause of
Discord `DiscordAPIError[10062]` "Unknown interaction" under load — even on handlers
that already `deferUpdate()`/`deferReply()` as their first line.

**Why:** when many players click buttons at once (e.g. everyone attacking during an
event), each handler holds a pooled connection through several sequential queries.
With only 10 connections, the 11th+ handlers queue, and all those pending promise
continuations saturate the Node event loop. Incoming gateway interactions then wait
in the WS receive queue, so by the time a handler's very first `deferUpdate()` runs,
the 3-second ack window has already passed → 10062. It looks like "the bot responds
too slowly" and the error is not in the handler that failed but in overall congestion.

**How to apply:** size the pool for peak concurrent interactions and add timeouts so a
starved request fails fast instead of hanging forever (a hang guarantees a missed
window; a fast error at least surfaces in the dispatcher `.catch`). Current config in
`lib/db/src/index.ts`: `max: 20`, `idleTimeoutMillis: 30_000`,
`connectionTimeoutMillis: 10_000`, `keepAlive: true`. This is a mitigation, not a
proof — after deploy, confirm 10062 counts actually drop in deployment logs, and watch
for new connection-timeout errors that would mean the pool needs more headroom.
Reducing per-handler round trips (batch with `Promise.all`) also directly helps.
