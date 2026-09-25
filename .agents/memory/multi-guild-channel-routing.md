---
name: Multi-guild channel routing
description: How getChannel() null return works and the fetchChannel() helper pattern for scheduler isolation.
---

## Rule
`getChannel(type, guildId)` returns `string | null`. Non-original guilds without `/setcanale` config get `null`. Scheduler MUST use `fetchChannel()` helper, which logs a warning and returns `null`. Every channel-dependent action must guard on `null` return and skip gracefully.

**Why:** Without this, new guilds would receive the original guild's hardcoded channel IDs as fallback, causing cross-guild message posting (isolation failure).

## How to apply
- `channel-config.ts` — `getChannel()` returns `string | null`.
- `scheduler.ts` — `fetchChannel(client, type, guildId)` wraps null check + Discord fetch + TextChannel instanceof check. Use `channel.id` for channelId fields in boss/chest state objects (don't re-call getChannel after fetch).
- `index.ts` — inline guard: `const id = getChannel(...); const ch = id ? await client.channels.fetch(id).catch(() => null) : null;`
- `startOracle(client, id)` — guard: `const id = getChannel("main", guildId); if (id) startOracle(client, id);`
- Automated destinations must also reject channels whose parent is one of the Oracle ticket categories; tickets are conversation-only and must never receive chests, events, bosses, or trader posts.

## Test pattern
Any Vitest test file that imports scheduler functions **must** mock `channel-config`:
```typescript
vi.mock("../channel-config", () => ({
  getChannel:        vi.fn(() => "mock-channel-id"),
  initChannelConfig: vi.fn(),
  getAllChannels:     vi.fn(() => ({})),
  setChannel:        vi.fn(),
  resetChannel:      vi.fn(),
  resetAllChannels:  vi.fn(),
}));
```
Without this mock, `getChannel` returns `null` for non-original test guild IDs, causing all scheduler channel actions to silently skip (no Discord calls, no channel.send), which breaks assertions expecting those calls.
