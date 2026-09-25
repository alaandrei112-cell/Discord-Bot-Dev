---
name: Locked chest race guard
description: Correct ordering for locked-chest claim to avoid double-open without double-key-consume.
---

## The rule

For locked chests (key required), the claim sequence must be:
1. `deferUpdate()` immediately
2. `consumePlayerKey()` — atomic DB op (WHERE key >= 1); returns false if no key → ephemeral error, stop
3. Check `claimedChests.has(chestId)` **after** consume — if already claimed → `addPlayerKey()` refund → ephemeral "too slow"
4. `claimedChests.add(chestId)` then award gold

**Why:** `consumePlayerKey` is atomic so it prevents players without keys from proceeding, but two simultaneous key-holders can both pass the has() check before either adds to the set. Consuming first means the worst case is one extra key consumed then immediately refunded — gold is never double-awarded because claimedChests gates the award.

**How to apply:** Any future locked-chest-style mechanic (locked events, locked boss rewards) should follow the same consume→check→add→award order, not check→consume.
