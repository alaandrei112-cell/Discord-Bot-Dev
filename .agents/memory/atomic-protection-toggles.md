---
name: Atomic protection toggles
description: Server-side save boundary for moderation protection switches.
---

Dashboard protection switches should use a dedicated server-side mutation that locks the guild config row and changes only the requested protection key. Full-config browser PUTs are too vulnerable to stale ETag conflicts for quick toggles. Native Discord rules must also be derived from each module's enabled state and must not overwrite administrator-created rules.

**Why:** Repeated 409 responses made a valid deactivation look broken even when the switch event fired.

**How to apply:** Keep the toggle mutation narrow, serialize it in the database, return the new config/version, and keep the UI optimistic with rollback on a final failure. Treat Discord native-rule conflicts as non-fatal because the in-process bot engine still enforces the stored configuration.