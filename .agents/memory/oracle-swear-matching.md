---
name: Oracle swear/insult matching
description: How the auto-mute guard decides a message is an insult, and why matching is stem-based.
---

The Oracle auto-moderation guard (`handleToxicity`) only mutes/warns when the bot
is @mentioned AND `containsSwear(text)` is true. Two design rules make it actually
fire on real Romanian insults:

- **Use prefix-stem matching (`\bstem`), not whole-word (`\bword\b`).** Insults are
  used in vocative/inflected forms ("prostule", "boule", "idioată", "proasto"),
  which whole-word patterns of the base form never match. List masc. AND fem.
  stems separately when they diverge (`prost`+`proast`, `idiot`+`idioat`,
  `dobitoc`+`dobitoac`).
- **Short, collision-prone words must stay whole-word (`\bword\b`).** Prefix-matching
  them auto-mutes innocent text: `boi`≠boiler, `vaca`≠vacanță, `porc`≠porțelan.
  `bou` is the exception — no innocent Romanian word starts with "bou", so it's a
  stem (catches boul/boule/boului).
- **Do NOT add broadly-innocent nouns** (e.g. `animal`) to the mute list — in this
  RPG server they appear in normal play and would mute real members.

**Why:** users reported the bot never muted when @mentioned + insulted; prod logs
showed only "Oracle AI reply sent" on mentions, never "toxicity action taken" —
i.e. `containsSwear` was returning false because the list was tiny and whole-word.

**How to apply:** edit `SWEAR_STEMS`/`SWEAR_EXACT` in `oracle-guard.ts`. This is a
DIFFERENT list from `TOXIC_STEMS`/`isToxic` in `oracle.ts`, which is mood-tracking
only (substring match, no punishment, gated behind MESSAGE_CONTENT_ENABLED).
Operators can append exact words at runtime via `ORACLE_SWEAR_WORDS`.
