---
name: Discord live countdown timers
description: How to make Discord `<t:UNIX:R>` countdowns match the actual expiry action, and where they can render.
---

# Discord live countdown timers

Discord renders `<t:UNIX_SECONDS:R>` as a self-updating relative countdown ("in 4 minutes").
Use `Math.floor(expiresAt / 1000)` to build it.

Rules learned:

- Store the absolute `expiresAt` (epoch ms) on the entity's state, and use that SAME value
  both for the embed timestamp AND to schedule the expiry `setTimeout`
  (`setTimeout(fn, Math.max(0, expiresAt - Date.now()))`). Do NOT compute `expiresAt` before
  an `await channel.send(...)` and then schedule the timer with a fixed duration constant after
  the send — the async send/setup latency makes the real expiry lag the displayed countdown.
  **Why:** the embed promised a flee time that the timer didn't honor (drift = send latency).
  **How to apply:** any "spawns now, expires later" entity (bosses, timed chests/events) whose
  countdown is shown to users.

- When the embed is re-rendered (e.g. boss HP edits on every hit), pass the stored `expiresAt`
  through again so the countdown stays anchored across edits.
  **Why:** refreshing a ticket panel must not promise a fresh hour while channel-age-based
  deletion still runs at the original deadline.
  **How to apply:** include delayed posting, form start, and restart refresh in timer tests;
  verify both the displayed timestamp and the actual deletion time.

- Timestamps render in the embed **description/field values**, NOT in the footer — Discord footers
  show `<t:...>` as literal text. Hide the countdown line entirely once the entity is defeated/expired.
