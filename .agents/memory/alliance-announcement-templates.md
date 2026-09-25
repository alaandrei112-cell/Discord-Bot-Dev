---
name: Alliance announcement templates
description: Rules for configuring public partnership announcements and Discord invite statistics.
---

Public partnership announcements are configured separately from the ticket questions and staff notification. The template can render submitted partnership answers and live counts returned by the Discord invite at publication time; unavailable counts must remain explicit rather than silently claiming a value.

**Why:** Partner servers are usually external to the bot's guild, so the invite is the only reliable source available during publication. Continuous refresh requires a separate message-refresh lifecycle and should not be implied by a one-time snapshot.

**How to apply:** Keep the local preview aligned with the same placeholder names and show clearly whether counts are a publication-time snapshot or continuously refreshed.