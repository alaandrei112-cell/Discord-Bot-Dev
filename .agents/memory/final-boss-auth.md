---
name: Final boss reward auth
description: Server-side eligibility checks required for event-scoped reward buttons in the Discord bot.
---

Any Discord button that grants rewards and is scoped to a specific event (e.g. the final-boss "Lovește Dragonul" button) must re-verify eligibility in its handler before granting, because Discord button messages persist and can be clicked long after the event ends.

Required checks before granting:
- event is active and not expired (getActiveEvent + expiresAt > now)
- the clicker is a participant of THAT event (getParticipant)
- the participant isAlive

**Why:** A handler that only does upsertPlayer + record-claim + grant lets non-participants, dead players, and users clicking stale post-expiry messages claim XP/gold/reputation. The per-claim dedupe (eventClaims onConflictDoNothing) prevents replay but NOT initial ineligible claims.

**How to apply:** When adding any new event-scoped reward button, mirror the guard block at the top of handleFinalBoss in index.ts.
