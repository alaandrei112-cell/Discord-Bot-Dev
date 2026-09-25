---
name: Owner gameplay configuration hydration
description: Owner-edited gameplay values are persisted in bot_state and must be hydrated before either the bot or the control panel reads them.
---

The gameplay profile is per guild and has one canonical persisted representation. The bot loads it during guild startup, while the owner control read path also hydrates it before returning data.

**Why:** A cache-only read can show defaults during the short window before the Discord client finishes startup, making a saved server profile appear lost and risking edits based on stale values.

**How to apply:** Any new consumer should use the shared guild gameplay store; any new owner-facing read should initialize that store before serializing the profile.