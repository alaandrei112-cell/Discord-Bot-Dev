---
name: Ephemeral anti-spam pattern
description: How repeated bot feedback messages are de-spammed (edit-in-place ephemerals + replace-previous public announcements)
---

Rule: any repeated per-click feedback must go through `sendOrEditEphemeral` (via `ephemeralNote(interaction, scope, content)` with scopes like trader/shop/ability/chest/combat), never raw `followUp({ephemeral})` — otherwise messages pile up in the user's chat.

**Why:** users complained boss-ability announcements and trader replies spammed the channel; also, a dismissed ephemeral silently swallows all future edits.

**How to apply:**
- Ephemerals: edit the same message only for a short window (~60s `freshUntil`), then post a fresh one and DELETE the old via the stored webhook (works within the ~15-min token). This bounds both "dismissed = invisible forever" and pile-up.
- Public recurring announcements (e.g. boss ability): keep a per-(guild,event) record, delete the previous message before posting the new one, auto-delete after ~2 min, and serialize the block with a per-key promise chain or concurrent hits post duplicates.
- Handlers must `deferUpdate()` first; `deferReply(ephemeral)` inherently creates a new message per click and defeats the pattern.
