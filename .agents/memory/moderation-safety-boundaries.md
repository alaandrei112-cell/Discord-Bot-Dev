---
name: Moderation safety boundaries
description: Identity, sanction, and attribution decisions for moderation independent of the RPG.
---

Do not substitute a workspace Discord connector for each moderation visitor's own Discord identity.

**Why:** The workspace connection represents the creator's account, whereas the moderation panel serves different users with different server permissions. Connecting that account cannot authenticate arbitrary visitors.

**How to apply:** When changing sign-in providers, preserve per-user Discord authorization instead of using the workspace account's server list. Keep bot-membership and staff checks independent of the chosen sign-in method.

Moderation remains independent of the RPG pause state. Rule severity adjusts detection sensitivity, not the configured sanction; only explicitly enabled escalation may promote sanctions.

**Why:** Stopping the game must not disable server protection, and choosing a warning must not silently authorize a ban.

**How to apply:** Check parent module toggles and protected targets before every effect, including deletion. An attempted or uncertain moderation effect must not fall through to the legacy Oracle guard and produce a second sanction.

Do not infer who deleted a message or changed roles from the affected member.

**Why:** Discord events often identify the target, not the actor. Punishing the target can sanction a victim of staff activity.

**How to apply:** Use reliable actor attribution where available; otherwise alert staff without automatic punishment.

The preview proxy terminates browser HTTPS before Express; the observed request protocol may be HTTP while the preserved Host still names the public development host.

**Why:** Comparing a browser Origin to Express's protocol plus Host rejected legitimate login requests behind the proxy.

**How to apply:** Verify origin protections through the real proxied URL, not only localhost tests. Do not compensate by allowing arbitrary origins or trusting arbitrary forwarded-host headers.