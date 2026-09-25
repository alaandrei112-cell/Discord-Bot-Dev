---
name: permanent trader repost guard
description: Re-post the permanent trader only on Discord 10008; any other error must keep the stored message.
---

The permanent trader is a single persistent Discord message whose ID is stored in
`bot_state`. On reconnect, `setupTrader()` fetches that ID and EDITS the message
instead of posting a new one.

**Rule:** only clear the stored ID and re-post when the fetch/edit error is Discord
code `10008` ("Unknown Message" — genuinely deleted). On ANY other error (network
blip, rate limit, missing permissions) keep the stored ID and return.

**Why:** treating *every* fetch/edit failure as "deleted" was the exact cause of the
duplicate-trader bug — a transient blip cleared the ID and re-posted, leaving two
permanent traders. This compounds with the bot_state-missing-table failure, which
also wiped trader persistence (see bot-state-table-self-heal.md).

**How to apply:** the same "only act on the specific Discord error code, not any
error" discipline applies to any single-persistent-message pattern that edits in
place across reconnects.
