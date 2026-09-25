import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginDiscordOAuth,
  consumeDiscordOAuthState,
  resetDiscordOAuthStateForTests,
} from "../oauth";

describe("Discord OAuth browser nonce", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetDiscordOAuthStateForTests();
    vi.useRealTimers();
  });

  function setup() {
    process.env.DISCORD_CLIENT_ID = "123456789";
    process.env.DISCORD_CLIENT_SECRET = "server-secret";
    process.env.DISCORD_OAUTH_REDIRECT_URI = "https://portal.example/api/moderation/oauth/discord/callback";
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    const request = (cookie?: string) => ({ headers: { cookie } });
    const url = beginDiscordOAuth(response as never);
    const state = response.cookie.mock.calls[0]?.[1] as string;
    return { response, request, state, url };
  }

  it("creates a Discord authorization URL with identify and guilds", () => {
    const { url, response, state } = setup();
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("123456789");
    expect(parsed.searchParams.get("scope")).toBe("identify guilds");
    expect(parsed.searchParams.get("redirect_uri")).toBe("https://portal.example/api/moderation/oauth/discord/callback");
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(response.cookie).toHaveBeenCalledWith(
      "moderation_oauth_state",
      state,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/api/moderation/oauth/discord" }),
    );
  });

  it("rejects a state mismatch in constant-time comparison and clears the nonce cookie", () => {
    const { response, request, state } = setup();
    expect(consumeDiscordOAuthState(request(`moderation_oauth_state=${state}`) as never, response as never, `${state}x`)).toBe(false);
    expect(response.clearCookie).toHaveBeenCalledWith("moderation_oauth_state", expect.objectContaining({ httpOnly: true }));
    // The browser-bound nonce is consumed on the mismatch, so the original
    // callback cannot be replayed after an attacker has forced a redirect.
    expect(consumeDiscordOAuthState(request(`moderation_oauth_state=${state}`) as never, response as never, state)).toBe(false);
  });

  it("consumes a valid state once and rejects replay", () => {
    const { response, request, state } = setup();
    expect(consumeDiscordOAuthState(request(`moderation_oauth_state=${state}`) as never, response as never, state)).toBe(true);
    expect(consumeDiscordOAuthState(request(`moderation_oauth_state=${state}`) as never, response as never, state)).toBe(false);
  });

  it("expires the state on the server independently of the cookie max-age", () => {
    vi.useFakeTimers();
    const { response, request, state } = setup();
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(consumeDiscordOAuthState(request(`moderation_oauth_state=${state}`) as never, response as never, state)).toBe(false);
  });
});