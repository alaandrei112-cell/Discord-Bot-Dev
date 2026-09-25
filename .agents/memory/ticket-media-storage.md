---
name: Ticket media storage
description: Ticket editor images use direct Object Storage uploads and public bot-readable object paths.
---

Ticket images are uploaded directly from the owner panel through a presigned PUT URL; the API must protect URL issuance with the moderation session, CSRF, guild-owner verification, and mutation rate limit. The saved object path is served through the API without browser authentication so Discord can fetch it.

**Why:** Discord cannot render a browser-authenticated storage endpoint, while sending image bytes through the API is unnecessary and increases server load.

**How to apply:** Keep uploaded image values as `/api/storage/objects/...` paths, resolve them against the configured public app domain when building Discord embeds, and keep pasted HTTPS URLs supported.