---
name: Discord dispatcher must be fire-and-forget
description: Why the interactionCreate dispatcher must use void/dispatch() not await for each handler call.
---

## Rule

The `interactionCreate` event handler must dispatch each sub-handler with a fire-and-forget pattern, NOT `await`.

```typescript
// WRONG — sequential, causes 10062 under load
await handleButton(interaction);

// CORRECT — concurrent, each handler runs independently
function dispatch(p: Promise<unknown>) {
  p.catch((err) => logger.error({ err }, "Interaction error"));
}
dispatch(handleButton(interaction));
```

## Why

Discord gives handlers 3 seconds before the interaction token expires. If the dispatcher uses `await`:

- Button A starts → `deferUpdate()` → 5 DB queries (200–500ms each) → total ~1.5s
- Button B clicks while A is running → queues behind A's `await`
- By the time B's handler starts, the 3s window has passed → `DiscordAPIError[10062]`

Under event load (many users clicking "Atacă" simultaneously), this causes cascading failures visible as "Această interacțiune a eșuat" in Discord.

## How to apply

- In the `client.on(Events.InteractionCreate, ...)` block, wrap all handler calls with `dispatch()`.
- Each handler still calls `deferUpdate()`/`deferReply()` as its **very first line** — that's still required.
- Errors are caught in the `.catch()` of `dispatch()` and logged as "Interaction error".
- This pattern means handlers run concurrently — make sure they don't share mutable state without locking (the bot already guards shared state with Maps and atomic DB WHERE clauses).
