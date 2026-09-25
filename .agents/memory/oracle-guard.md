---
name: Oracle toxicity guard
description: How the Oracle anti-swear mute system works and what permissions it needs.
---

## Rule
`oracle-guard.ts` intercepts @mentions containing profanity before the normal Oracle reply path.
It applies an escalating Discord timeout and replies with an in-character Romanian curse.
Direct toxic messages must still record the negative Oracle relationship change and public announcement;
the guard must not silently bypass relationship accounting.

## How to apply
Called in `index.ts` messageCreate handler:
```typescript
void handleToxicity(client, message).then((handled) => {
  if (!handled) void maybeReplyAsOracle(client, message);
});
```

## Permission requirements (non-obvious)
- Bot role needs **ModerateMembers** in the server settings.
- Bot's highest role must be **above** the target member's highest role (`member.manageable`).
- When either is missing the Oracle still posts the warning but prints a `logger.warn` and skips the timeout call.

## Escalation table
| Offense | Mute duration |
|---------|--------------|
| 1st | 10 min |
| 2nd | 30 min |
| 3rd | 1 h |
| 4th | 2 h |
| 5th | 4 h |
| 6th+ | 8 h |
Counter resets after 24 h of no new offenses.

## Extending the word list
Set env var `ORACLE_SWEAR_WORDS=cuvant1,cuvant2` (comma-separated, diacritics optional).
Loaded at startup; requires restart to pick up changes.

**Why:** Timeout requires both ModerateMembers AND role hierarchy — missing either silently prevents the mute without crashing the bot.

**Why:** The toxicity handler runs before the normal Oracle chat handler, so direct insults otherwise
would be punished without reducing the player's relationship with the Oracle.

**How to apply:** When changing the messageCreate routing or toxicity guard, preserve exactly-once
relationship recording for toxic mentions and replies, while leaving non-directed toxic messages silent.
