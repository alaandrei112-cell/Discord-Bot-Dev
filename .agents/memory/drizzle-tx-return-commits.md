---
name: Drizzle transaction return commits
description: Returning null/normally from db.transaction COMMITS; guard failures must throw to roll back.
---
Rule: inside `db.transaction(async (tx) => …)`, returning normally (including `return null` on a failed guard) COMMITS the transaction. Any multi-step operation (deduct items → update player) must THROW a sentinel error on guard failure and catch it outside, or earlier deductions are committed without the final update applying.

**Why:** class-upgrade originally returned null after item deductions when the player UPDATE matched 0 rows — materials were consumed with no upgrade.

**How to apply:** in every transactional spend/upgrade helper, throw on 0-row guarded updates; also enforce level/state caps server-side (stale Discord buttons can call handlers past UI limits).
