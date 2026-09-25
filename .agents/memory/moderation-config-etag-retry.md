---
name: Moderation config ETag retries
description: How the moderation dashboard should handle concurrent configuration edits.
---

Protection settings are saved with an optimistic ETag/version check. A stale dashboard snapshot can receive a 409 even when the user's change is valid, so toggle saves should refetch the latest config and reapply only the intended field before retrying once.

**Why:** The dashboard and other configuration writers can overlap, and treating a 409 as a permanent failure makes working toggles appear broken.

**How to apply:** Keep the requested change as a transform function over the latest config; never retry the entire stale object blindly, and surface a clear error if the retry also conflicts.

Category editors must merge only their owned configuration fields into the latest server snapshot before saving, not send the entire object captured when the page opened.

**Why:** An unrelated dashboard toggle can change while an editor remains open. Reusing that editor's full snapshot can restore older settings and look like a persistence reset.

**How to apply:** Preserve unrelated fields on the initial save as well as a conflict retry; test an editor save after a concurrent toggle and verify both changes survive reload.