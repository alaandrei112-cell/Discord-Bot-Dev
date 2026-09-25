---
name: Discord guild count fetch
description: How the public status endpoint should retrieve current Discord member and presence counts.
---

Use a forced REST guild fetch with `withCounts: true` when reading approximate member/presence counts. A normal `GuildManager.fetch` call returns the cached gateway Guild when available, and that object may have null approximate counts.

**Why:** The public status endpoint reported `live: true` while both counts were null because the bot's cached Guild was returned instead of a fresh REST response.

**How to apply:** For status/dashboard endpoints, call the guild fetch with `force: true`; use the regular member count only as a fallback for total members.