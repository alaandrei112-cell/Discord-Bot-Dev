---
name: Discord privileged intent gating
description: Why MessageContent (and other privileged gateway intents) must be gated behind an env flag, default off.
---

# Privileged gateway intent gating

Always request only the non-privileged intents the bot needs unconditionally
(e.g. `Guilds`, `GuildMessages`). `GuildMembers`, `GuildPresences`, and
`MessageContent` are all **privileged** intents: gate each behind an explicit
opt-in and include all three in the disallowed-intent recovery path.

**Why:** If the bot requests a privileged intent that is NOT toggled on in the
Discord Developer Portal, the gateway closes the connection with a fatal code
(4014 "Disallowed intent") and the bot never logs in. Because this bot only runs
when `NODE_ENV=production`, such a brick is invisible in dev — it would only
surface in prod. A default-off flag means the bot always boots; the operator
opts into the privileged feature by (1) flipping the portal toggle AND (2)
setting the env flag to `"true"`.

**How to apply:** Build the intents array with the safe set always, then
conditionally `push` the privileged intent only when the flag is `"true"`.
Features that depend on the privileged data must degrade gracefully when it is
absent (e.g. activity tracking still works from message metadata even when
message *content* is unavailable). Log a warning at startup when the privileged
feature is disabled so the operator knows why it is inactive.

**Runtime fallback (belt-and-suspenders):** the env flag alone is not enough —
if the operator sets the flag but forgets the portal toggle, the supervisor
loop restarts the bricked bot forever, re-requesting the intent each time. So
also catch the 4014 at runtime (both the `client.login()` rejection AND the
`ShardDisconnect` event — discord.js surfaces it in different shapes by
version), set a module-level "fell back" flag, and on the supervisor's next
restart drop the privileged intent so the bot boots degraded instead of
looping. This is what makes flipping the flag actually *safe* even when the
portal toggle is missing.
