---
name: Vitest discord.js mock pattern
description: How to correctly mock discord.js classes and timers when unit-testing scheduler fire* functions.
---

## Rule
When mocking discord.js for scheduler unit tests, use real class bodies for anything called with `new`. Arrow-function factories are not constructors and throw TypeError when called with `new`, which the scheduler's try/catch silently swallows as a `return null`.

**Why:** `ActionRowBuilder`, `ButtonBuilder`, `EmbedBuilder` are all used as `new X()` in scheduler.ts. If mocked as `vi.fn(() => ({...}))`, vitest logs a warning and the constructor call throws, causing every fire* function to return null/early with no observable error.

**How to apply:**
```typescript
vi.mock("discord.js", () => {
  class MockActionRowBuilder {
    addComponents() { return this; }
  }
  class MockButtonBuilder {
    setCustomId() { return this; }
    setLabel()    { return this; }
    setStyle()    { return this; }
    setEmoji()    { return this; }
    setDisabled() { return this; }
  }
  class MockEmbedBuilder {
    setColor() { return this; } // etc.
  }
  return { ActionRowBuilder: MockActionRowBuilder, ButtonBuilder: MockButtonBuilder, EmbedBuilder: MockEmbedBuilder, ... };
});
```

## instanceof TextChannel
Use `Symbol.hasInstance` backed by a WeakSet defined in `vi.hoisted` to make `instanceof TextChannel` work reliably across module-scope boundaries:
```typescript
const { MockTextChannel } = vi.hoisted(() => {
  const _instances = new WeakSet();
  class MockTextChannel {
    constructor() { _instances.add(this); }
    static [Symbol.hasInstance](obj) {
      return obj !== null && typeof obj === "object" && _instances.has(obj);
    }
  }
  return { MockTextChannel };
});
```

## Fake timers with fireChest
`fireChest` has animation sleeps (~10 s total) + a 10-minute chest-expiry setTimeout.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` in beforeEach/afterEach.
- Use `vi.advanceTimersByTimeAsync(30_000)` (30 s) — NOT `vi.runAllTimersAsync()`.
- `runAllTimers` fires the 10-min expiry, adding chestId to `claimedChests` before assertions can check it unclaimed.
