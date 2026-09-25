---
name: drizzle push blocked by interactive prompt
description: pnpm db push fails non-interactively when an unrelated table needs a destructive change; apply additive column changes via raw SQL instead
---

# drizzle-kit push is interactive and can be blocked

`pnpm --filter @workspace/db run push` runs `drizzle-kit push`, which prompts
interactively (TTY) when a change is potentially destructive. In a non-TTY shell
it errors: "Interactive prompts require a TTY terminal".

This can be triggered by a *pre-existing, unrelated* schema drift (e.g. a unique
constraint that drizzle wants to add to a table containing rows, asking to
truncate it) — so even an unrelated additive change you make can't be pushed
through this command.

**How to apply:** for purely additive schema changes (new columns with defaults),
edit the Drizzle schema file (so types stay correct) AND apply the column to the
dev DB directly with idempotent SQL via `executeSql` in code execution:
`ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type> NOT NULL DEFAULT <v>`.
This keeps the schema source-of-truth and the live DB in sync without triggering
the destructive-prompt path. For production, the same ALTERs (or a resolved
`drizzle-kit push` once the unrelated drift is fixed) must be run separately —
the manual dev ALTER does not propagate to other environments.
