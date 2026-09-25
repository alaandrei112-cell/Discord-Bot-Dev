---
name: Discord class images
description: Class artwork is served from stable artifact asset names and selected by the internal class key, not by uploaded filenames.
---

For Discord class artwork, keep the database class identifiers stable and map them to sanitized, stable files under the API asset directory. The displayed class label can change independently from the stored key.

**Why:** Uploaded filenames include timestamps and inconsistent underscores; using them directly would make embeds and future replacements fragile.

**How to apply:** Add new art through the asset mapping, preserve the internal class key, and set the class image on both the class detail embed and player profile embed.