import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ pool: {} }));
vi.mock("discord.js", () => ({
  PermissionFlagsBits: { Administrator: 8n, ManageGuild: 32n },
}));

import { assertTrustedOrigin, clearSessionCookie, getGuildAccess, hashSecret, requireSession, setModerationClient, setSessionCookie } from "../auth";

describe("moderation web-session security", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("hashes secrets deterministically without retaining plaintext", () => {
    expect(hashSecret("temporary-code")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSecret("temporary-code")).toBe(hashSecret("temporary-code"));
    expect(hashSecret("temporary-code")).not.toBe("temporary-code");
  });

  it("uses an HttpOnly strict secure cookie in production", () => {
    process.env.NODE_ENV = "production";
    const response = { cookie: vi.fn(), clearCookie: vi.fn() };
    const expiry = new Date("2030-01-01T00:00:00.000Z");
    setSessionCookie(response as never, "opaque-session-token", expiry);
    expect(response.cookie).toHaveBeenCalledWith("moderation_session", "opaque-session-token", expect.objectContaining({
      httpOnly: true, sameSite: "strict", secure: true, path: "/api/moderation", expires: expiry,
    }));
    clearSessionCookie(response as never);
    expect(response.clearCookie).toHaveBeenCalledWith("moderation_session", expect.objectContaining({
      httpOnly: true, sameSite: "strict", secure: true, path: "/api/moderation",
    }));
  });

  it("forces fresh guild and member reads before granting access", async () => {
    const memberFetch = vi.fn().mockResolvedValue({
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } },
    });
    const guildFetch = vi.fn().mockResolvedValue({
      id: "123456", ownerId: "owner",
      members: { fetch: memberFetch },
    });
    setModerationClient({ guilds: { fetch: guildFetch } } as never);

    await expect(getGuildAccess("123456", "owner")).resolves.toBe("owner");
    expect(guildFetch).toHaveBeenCalledWith({ guild: "123456", force: true });
    expect(memberFetch).toHaveBeenCalledWith({ user: "owner", force: true });
  });

  it("treats malformed cookie encoding as unauthenticated", async () => {
    await expect(requireSession({ headers: { cookie: "moderation_session=%E0%A4" } } as never))
      .rejects.toMatchObject({ status: 401 });
  });

  it("allows Replit's proxied HTTPS same-origin request without trusting forwarded host", () => {
    const req = {
      protocol: "http",
      header: (name: string) => name === "origin" ? "https://demo.replit.dev" : undefined,
      get: (name: string) => name === "host" ? "demo.replit.dev" : undefined,
    };
    expect(() => assertTrustedOrigin(req as never)).not.toThrow();
  });

  it("denies a cross-origin login request", () => {
    const req = {
      protocol: "http",
      header: (name: string) => name === "origin" ? "https://attacker.example" : undefined,
      get: (name: string) => name === "host" ? "demo.replit.dev" : undefined,
    };
    expect(() => assertTrustedOrigin(req as never)).toThrow(/Untrusted/);
  });
});