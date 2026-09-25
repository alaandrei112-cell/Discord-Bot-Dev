---
name: Discord OAuth environments
description: Environment-specific callback configuration required by the moderation panel's Discord OAuth flow.
---

The moderation panel's Discord OAuth callback must be configured separately for development and production. Having `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and a production `DISCORD_OAUTH_REDIRECT_URI` is not enough for the preview workflow; development must have its own exact callback URL registered in Discord.

**Why:** The OAuth implementation intentionally fails closed when the redirect URI is absent, so preview shows the normal "authentication unavailable" state even though the API and production configuration are healthy.

**How to apply:** When preview login is unavailable, check the development environment for `DISCORD_OAUTH_REDIRECT_URI` and register the matching `/api/moderation/oauth/discord/callback` URL in the Discord application without overwriting the production callback.