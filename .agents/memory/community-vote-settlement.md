---
name: Community vote settlement
description: Reliability rule for Discord votes that close first and distribute rewards afterward.
---

Treat “voting closed,” “reward delivered,” and “result published” as separate persisted states. A closed vote with unfinished settlement must be retried during rehydration, and the public result must state what was granted and how many players received it. Durable rewards and their completion marker must commit atomically or use an idempotency key.

**Why:** A transient database or Discord failure after closing previously made later attempts return early, leaving a completed vote with no visible or actual outcome.

**How to apply:** Use this for every timed community vote or collaborative objective whose settlement spans multiple operations. Discord publication can retry separately after the database transaction. Keep completed-message cleanup restart-safe as well.