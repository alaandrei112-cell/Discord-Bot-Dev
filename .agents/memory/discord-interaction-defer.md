---
name: Discord interaction defer
description: Why every Discord handler doing DB/network work must defer before responding (prod-only 10062).
---

# Defer before slow work in interaction handlers

Any Discord interaction handler (slash command **or** button) that does DB or
network work before its first response MUST `deferReply()` (slash) or
`deferUpdate()` (button) at the very top, then `editReply()` / `followUp()`.

**Why:** Discord expires the interaction token ~3s after it is sent. In
production the Postgres pool's first query pays a cold connect + TLS handshake,
which can push the first `reply()`/`update()` past 3s → `DiscordAPIError[10062]
"Unknown interaction"`. The failed reply often still carries fully-populated
real data — proof the query *succeeded* but landed too late.

**Invisible in dev:** the bot only runs when `NODE_ENV=production` (disabled in
dev), so this class of bug cannot be reproduced locally. Reason about ack timing
instead of relying on a dev repro.

**How to apply:**
- Defer first, before any `await` that hits the DB/Discord API.
- For in-memory dedup guards (e.g. `claimedChests`), keep the `has()` check and
  the `add()` adjacent with **no `await` between them**, even after adding a
  leading `deferUpdate()` — otherwise two concurrent clicks both pass the guard
  and double-claim.
- Also warm the DB pool at boot (`pool.query("SELECT 1")`) so the first real
  command isn't the one paying the cold-connect cost.
