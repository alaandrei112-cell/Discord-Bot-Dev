---
name: Boss fights are rarity-based, not level-based
description: Mini-bosses can ambush at any level; boss checks must use the stored rarity.
---

The rule: a fight is a boss fight when the participant's stored `monsterRarity === "boss"`, NOT when `level % 10 === 0`. Mini-bosses spawn guaranteed at %10 levels but also as a small random "ambush" at any level via `rollRarity`.

**Why:** monster stat functions (max HP, damage range, hit chance, name/image) are pure functions of level; after ambush bosses were added they take an optional rarity argument. Any caller that omits rarity silently falls back to the level-only check, giving an ambush boss normal-monster stats (HP desync between stored `monsterCurrentHp` and computed max HP).

**How to apply:** when adding new combat/embed/scheduler code that computes monster stats or names, always pass the participant's `monsterRarity` through. Tests mocking `../assets` must export every symbol survival.ts imports (`monsterImg`, `bossImg`, `MONSTER_IMG`, `IMG`, …) or the fight-embed path crashes with undefined.
