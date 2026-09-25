---
name: Moderation threshold compatibility
description: Preserve legacy rule-threshold values while filling moderation defaults.
---

Treat a canonical threshold key and its accepted compatibility aliases as one logical value group. Add a default only when none of the group’s keys is explicitly configured, and keep the editor’s alias controls displaying and writing the same value.

**Why:** Runtime code may read the canonical key before an older alias. Adding a canonical default beside an alias-only saved value can silently change the effective threshold.

**How to apply:** Keep schema defaults and editor alias groups aligned. Normalize missing values in memory without persisting them on reads, and leave enforcement disabled unless explicitly enabled.