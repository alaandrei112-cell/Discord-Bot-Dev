import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeState: vi.fn(),
  consumeRequest: vi.fn(),
  exchange: vi.fn(),
  identity: vi.fn(),
  listGuilds: vi.fn(),
  createSession: vi.fn(),
  revoke: vi.fn(),
  setCookie: vi.fn(),
  clearCookie: vi.fn(),
  configured: vi.fn(),
  beginVerification: vi.fn(),
  snapshot: vi.fn(),
  verifyMember: vi.fn(),
  requireSession: vi.fn(),
  access: vi.fn(),
  csrf: vi.fn(),
  client: vi.fn(),
  getConfig: vi.fn(),
  putConfig: vi.fn(),
  listCases: vi.fn(),
  listAudit: vi.fn(),
  listLogs: vi.fn(),
  getAction: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../auth", () => ({
  ModerationAuthError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  requireSession: mocks.requireSession,
  assertGuildAccess: mocks.access,
  assertCsrf: mocks.csrf,
  getModerationClient: mocks.client,
  assertLoginRateLimit: vi.fn(),
  assertMutationRateLimit: vi.fn(),
  clearSessionCookie: mocks.clearCookie,
  createModerationSession: mocks.createSession,
  listAccessibleGuilds: mocks.listGuilds,
  revokeRequestSessionIfPresent: mocks.revoke,
  setSessionCookie: mocks.setCookie,
}));

vi.mock("../oauth", () => ({
  beginDiscordOAuth: vi.fn(() => "https://discord.com/oauth2/authorize?state=opaque"),
  beginVerificationOAuth: mocks.beginVerification,
  consumeDiscordOAuthRequest: mocks.consumeRequest,
  consumeDiscordOAuthState: mocks.consumeState,
  exchangeDiscordOAuthCode: mocks.exchange,
  fetchDiscordOAuthIdentity: mocks.identity,
  fetchBotGuildSnapshot: mocks.snapshot,
  isDiscordOAuthConfigured: mocks.configured,
}));

vi.mock("../../bot/verification", () => ({
  createVerificationIdentityToken: vi.fn(() => "signed-verification-token"),
  normalizeVerificationConfig: vi.fn((value) => value),
  parseVerificationIdentityToken: vi.fn(),
  publishVerificationPanel: vi.fn(),
  verificationCookieName: vi.fn(() => "verification_identity"),
  verifyMember: mocks.verifyMember,
  DEFAULT_VERIFICATION_CONFIG: {},
}));

vi.mock("../store", () => ({
  moderationStore: {
    getConfig: mocks.getConfig,
    putConfig: mocks.putConfig,
    listCases: mocks.listCases,
    listAudit: mocks.listAudit,
    listModerationLogs: mocks.listLogs,
    pruneCases: vi.fn(),
    getAction: mocks.getAction,
  },
}));

vi.mock("../../bot/moderation/engine", () => ({ executeModerationAction: mocks.execute }));

import router from "../router";

describe("Discord OAuth moderation routes", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/moderation", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    base = `http://127.0.0.1:${address.port}/moderation`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.configured.mockReturnValue(true);
    mocks.consumeRequest.mockReturnValue({ purpose: "moderation", expiresAt: Date.now() + 60_000 });
    mocks.consumeState.mockReturnValue(true);
    mocks.exchange.mockResolvedValue("server-only-oauth-token");
    mocks.identity.mockResolvedValue({
      id: "987654321",
      guilds: [{ id: "123456789", name: "Eligible guild" }],
    });
    mocks.listGuilds.mockResolvedValue([{ id: "123456789", name: "Eligible guild", access: "owner" }]);
    mocks.createSession.mockResolvedValue({
      token: "opaque-session-token",
      session: { userId: "987654321", csrfToken: "csrf", expiresAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    mocks.beginVerification.mockReturnValue("https://discord.com/oauth2/authorize?state=verification-state");
    mocks.snapshot.mockResolvedValue({
      guild: { id: "123456789", name: "Eligible guild", ownerId: "111111111" },
      member: { id: "987654321", roleIds: [] },
      roles: [],
    });
    mocks.client.mockReturnValue({});
    mocks.verifyMember.mockResolvedValue("verified");
  });

  it("exposes only the public OAuth configuration", async () => {
    const response = await fetch(`${base}/auth-config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      discordOAuthConfigured: true,
      authorizationUrl: "/api/moderation/oauth/discord",
      bot: null,
    });
  });

  it("redirects a cancelled callback without exchanging a code", async () => {
    mocks.identity.mockReset();
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&error=access_denied`, {
      headers: { cookie: "moderation_oauth_state=valid" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/moderare?auth_error=cancelled");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("redirects a state mismatch before any OAuth token request", async () => {
    mocks.consumeRequest.mockReturnValue(null);
    mocks.consumeState.mockReturnValue(false);
    const response = await fetch(`${base}/oauth/discord/callback?state=attacker&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=state_mismatch");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("returns a safe error for token exchange failures", async () => {
    mocks.exchange.mockRejectedValue(new Error("token body must not reach the client"));
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=oauth_failed");
    expect((await response.text())).not.toContain("one-time-code");
  });

  it("completes member verification with an HttpOnly identity cookie and a safe redirect", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verificare?guildId=123456789&verification=verified");
    expect(mocks.verifyMember).toHaveBeenCalledWith({}, "123456789", "987654321");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("verification_identity=signed-verification-token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain("server-only-oauth-token");
    expect(cookie).not.toContain("one-time-code");
  });

  it("redirects a cancelled member verification to the verification page without exchanging a code", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&error=access_denied`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verificare?verification_error=cancelled&guildId=123456789");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("keeps member verification OAuth failures on the verification page without leaking the token", async () => {
    mocks.consumeRequest.mockReturnValue({ purpose: "verification", guildId: "123456789", expiresAt: Date.now() + 60_000 });
    mocks.exchange.mockRejectedValue(new Error("server-only-oauth-token must not reach the client"));

    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/verificare?verification_error=oauth_failed&guildId=123456789");
    const body = await response.text();
    expect(body).not.toContain("server-only-oauth-token");
    expect(body).not.toContain("one-time-code");
  });

  it("rejects a login with no bot-eligible guild", async () => {
    mocks.listGuilds.mockResolvedValue([]);
    const response = await fetch(`${base}/oauth/discord/callback?state=valid&code=one-time-code`, {
      redirect: "manual",
    });
    expect(response.headers.get("location")).toBe("/moderare?auth_error=no_eligible_guild");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("creates the session from the server OAuth identity, never a callback identity", async () => {
    const response = await fetch(
      `${base}/oauth/discord/callback?state=valid&code=one-time-code&user_id=attacker`,
      { headers: { cookie: "moderation_session=old-session" }, redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/moderare");
    expect(mocks.createSession).toHaveBeenCalledWith("987654321");
    expect(mocks.createSession).not.toHaveBeenCalledWith("attacker");
    expect(mocks.revoke).toHaveBeenCalled();
    expect(mocks.setCookie).toHaveBeenCalledWith(
      expect.anything(),
      "opaque-session-token",
      expect.any(Date),
    );
  });

  it("disables the legacy code login endpoint", async () => {
    const response = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ABCDEF" }),
    });
    expect(response.status).toBe(410);
  });
});