---
name: bot_state table self-heal
description: Why every bot_state helper must idempotently ensure its table exists, not rely on a single startup call.
---

The production DB can be missing tables that only exist via Drizzle migrations (the
migration was never applied to prod). When `bot_state` is absent, every reader fails
with `relation "bot_state" does not exist` — this silently breaks chest rehydration,
the Oracle recovery marker, AND permanent-trader persistence at once.

**Rule:** guard EVERY bot_state helper with a singleton `ensureBotStateTable()` (a
cached promise that runs `CREATE TABLE IF NOT EXISTS` once and resets the cache on
failure so a later call retries). Do not rely on a single CREATE at startup.

**Why:** both `ClientReady` and `ShardReady` call `setupTrader()` and can fire
concurrently / out of order, so a helper read (e.g. `loadTraderMessageId`) can race
ahead of any one-shot startup create. Per-helper guarding is the only race-free fix.

**How to apply:** any new durable key/value helper added to db.ts must `await
ensureBotStateTable()` as its first line. The same self-heal pattern (idempotent
CREATE TABLE IF NOT EXISTS) applies to any other prod table that may predate its
migration — see drizzle-push-blocked.md.
