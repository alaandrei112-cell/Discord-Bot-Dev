---
name: Bot-control round trips
description: Reliability rules for owner-console settings that must take effect in the live Discord bot.
---

Every value returned by the bot-control GET endpoint must be valid when submitted unchanged to its PUT endpoint. A successful save must update both persistent storage and the bot's active in-process configuration.

**Why:** Returning an empty default while rejecting that same value on save caused the owner console to receive HTTP 400 and made all unrelated changes appear ineffective. Persisting new event intervals without restarting the existing scheduler also delayed their visible effect.

**How to apply:** Add a round-trip test whenever bot-control fields change. Refresh the relevant cache after persistence, and restart the guild scheduler when pause state or event timing changes.