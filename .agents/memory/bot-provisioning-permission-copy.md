---
name: Provisioning permission language
description: The distinction between bot capability checks and per-category member permissions in channel provisioning.
---

The provisioning UI must not present “Manage Permissions” or “Send Messages” as independently verified global bot permissions. Discord channel permission overwrites are performed through the bot's Manage Channels capability; Send Messages and Read Message History are selected per category and role when the channel overwrites are created.

**Why:** Static “de verificat” labels implied that the app could verify permissions it does not fetch, and made a successful Manage Channels check look incomplete.

**How to apply:** Derive the provisioning status from `botCapabilities.canManageChannels`. Describe role/channel access as configurable per category, and keep the server-side Manage Channels guard authoritative.