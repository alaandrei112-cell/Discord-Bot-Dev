---
name: Event participant bonus snapshot
description: Persistent player stat bonuses are snapshotted into the event participant at join; mid-event changes must be mirrored onto the active participant
---

# Event participant bonus snapshot

Combat reads stats from the `EventParticipant` row (attackBonus, defenseBonus,
dodgeBonus, critBonus, maxHp, currentHp), NOT from the `players` row. `joinEvent`
snapshots the player's persistent bonuses into the participant once, at join time.
Level-up choices then add on top of the participant row during the event.

**Why it matters:** any change to a player's persistent stats (e.g. a shop
purchase) made *after* they joined an active event does NOT affect the current
fight unless it is also applied to the live participant row. This caused a "shop
upgrades don't do anything mid-event" bug. Fix: `applyUpgradeToActiveParticipant`
mirrors the same delta onto the alive participant of any active (isActive +
not-expired) event, called right after a successful `buyPlayerUpgrade`.

**How to apply:** when adding any future system that mutates persistent player
combat stats (classes, passives, items, etc.), if it can happen during a live
event, mirror the delta onto the active participant too. Keep the player-side and
participant-side deltas driven by one shared constant (`UPGRADE_DELTA`) so they
can't drift. No double-counting risk: each new event re-snapshots from `players`
at join, and the participant is incremented once per successful purchase.

## Combat footer HP bonus is derived, not stored

`EventParticipant` has no `maxHpBonus` column. The combat footer shows the HP
bonus as `p.maxHp - 100` (base HP = 100). This is brittle: if base HP ever
changes, or in-event level-up HP gains are added to `maxHp`, this derived "bonus"
will drift from the shop-purchased HP bonus. The shop embed, by contrast, reads
the true `players.maxHpBonus`. If exact parity is ever required, track an explicit
participant HP-bonus field instead of subtracting a hardcoded baseline.
