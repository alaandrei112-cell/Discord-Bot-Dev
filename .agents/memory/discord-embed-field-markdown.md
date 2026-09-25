---
name: Discord embed field-name markdown
description: Discord renders embed field NAMES literally — markdown there shows raw asterisks.
---

Discord renders embed **field names** literally: `**bold**` / `*italic*` markdown
in a field `name` shows the raw asterisks, it does NOT format. Markdown only works
in the embed `description` and in field `value`.

**Why:** A `sectionTitle()` helper that wraps text in `**...**` was reused for both
descriptions and field names; in field names it leaked literal `**` into the UI.

**How to apply:** For section headers that are embed field names, use plain text
dividers (e.g. `━━━ Resurse ━━━`) instead of bold markdown. Keep bold/italic for
description text and field values only.
