---
name: Oracle recovery alert / fallback marker
description: Why the "Oracle back to full-reply mode" recovery alert needs an on-disk marker, not the in-memory fallback flag.
---
The Oracle sends a recovery alert when it returns to full-reply mode after a
"Message Content" portal-toggle (code 4014) fallback.

The rule: detection of "previously fell back" CANNOT rely on the in-memory
`privilegedIntentFellBack` flag alone.

**Why:** `privilegedIntentFellBack` resets on every process restart, and the
recovery path *is* a restart (operator flips the portal toggle, then restarts).
Within a single process, once it falls back it boots degraded for the rest of
that process's life (the boot gate uses the flag). So a ClientReady check that
reads only the in-memory flag would never fire on the real recovery path.

**How to apply:** A durable marker is written on the 4014 fallback paths and
consumed once at ClientReady when in full mode. It lives in the DB
(`bot_state` key/value table, key `oracle_fellback`; helpers
`recordOracleFellBack`/`consumeOracleFellBack` in `bot/db.ts`), NOT in
`os.tmpdir()` — a tmpdir marker survives an in-container restart but is wiped on
a full redeploy / new autoscale container, silently dropping the recovery alert.
The DB store survives redeploys. `consumeOracleFellBack` uses
`DELETE ... RETURNING` so concurrent boots race atomically and only one fires the
alert (no duplicates). This is a deliberate exception to the bot's
"transient state out of the DB" convention, justified by the cross-container
durability requirement.
