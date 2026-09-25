import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const OAUTH_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const OAUTH_TOKEN_URL = `${DISCORD_API_BASE}/oauth2/token`;
const OAUTH_STATE_COOKIE = "moderation_oauth_state";
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING_STATES = 10_000;
const SNOWFLAKE = /^\d{5,25}$/;

export interface PendingOAuthState {
  expiresAt: number;
  purpose: "moderation" | "verification";
  guildId?: string;
}

/**
 * Discord documents the authorization-code grant, but does not document PKCE
 * for this flow.  This is therefore a confidential server-side exchange,
 * protected by a one-time state value bound to the browser cookie.
 */
const pendingStates = new Map<string, PendingOAuthState>();

export interface DiscordOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DiscordOAuthGuild {
  id: string;
  name: string;
}

export interface DiscordOAuthIdentity {
  id: string;
  guilds: DiscordOAuthGuild[];
}

export interface DiscordRestGuild {
  id: string;
  name: string;
  ownerId: string;
}

export interface DiscordRestMember {
  id: string;
  roleIds: string[];
  permissions?: string;
}

export interface DiscordRestRole {
  id: string;
  permissions: string;
}

export interface DiscordRestGuildSnapshot {
  guild: DiscordRestGuild;
  member: DiscordRestMember;
  roles: DiscordRestRole[];
}

export type DiscordOAuthFailureStage =
  | "token_exchange"
  | "token_response"
  | "oauth_api"
  | "oauth_response";

export class DiscordOAuthError extends Error {
  constructor(
    message: string,
    readonly stage: DiscordOAuthFailureStage,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DiscordOAuthError";
  }
}

function configuredRedirectUri(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    // Discord requires the redirect_uri used at exchange to exactly match the
    // registered value, so preserve the explicit environment value after
    // validation rather than normalizing it.
    return trimmed;
  } catch {
    return null;
  }
}

export function getDiscordOAuthConfig(): DiscordOAuthConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = configuredRedirectUri(process.env.DISCORD_OAUTH_REDIRECT_URI);
  if (!clientId || !clientSecret?.trim() || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isDiscordOAuthConfigured(): boolean {
  return getDiscordOAuthConfig() !== null;
}

export function getModerationWebsiteUrl(): string {
  const configuredOrigin = process.env.MODERATION_WEB_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      const origin = new URL(configuredOrigin);
      if (origin.protocol === "https:" || origin.protocol === "http:") {
        return new URL("/moderare", origin).toString();
      }
    } catch {
      // The OAuth route will fail closed if its explicit redirect URI is also
      // invalid.  The command still gets a harmless relative portal link.
    }
  }
  const configuredRedirect = configuredRedirectUri(process.env.DISCORD_OAUTH_REDIRECT_URI);
  if (configuredRedirect) {
    return new URL("/moderare", configuredRedirect).toString();
  }
  return "/moderare";
}

function clearExpiredStates(now = Date.now()): void {
  for (const [state, pending] of pendingStates) {
    if (pending.expiresAt <= now) pendingStates.delete(state);
  }
}

function makeState(): string {
  return randomBytes(32).toString("base64url");
}

function sameSecret(left: string | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function stateCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/moderation/oauth/discord",
    ...(expiresAt ? { expires: expiresAt, maxAge: OAUTH_STATE_TTL_MS } : {}),
  };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export function beginDiscordOAuth(res: Response): string {
  return beginOAuth(res, { purpose: "moderation" });
}

export function beginVerificationOAuth(res: Response, guildId: string): string {
  return beginOAuth(res, { purpose: "verification", guildId });
}

function beginOAuth(res: Response, pendingState: Omit<PendingOAuthState, "expiresAt">): string {
  const config = getDiscordOAuthConfig();
  if (!config) throw new Error("Discord OAuth is not configured");
  clearExpiredStates();
  if (pendingStates.size >= MAX_PENDING_STATES) {
    clearExpiredStates();
    if (pendingStates.size >= MAX_PENDING_STATES) throw new Error("Too many pending Discord OAuth requests");
  }

  const state = makeState();
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  pendingStates.set(state, { ...pendingState, expiresAt: expiresAt.getTime() });
  res.cookie(OAUTH_STATE_COOKIE, state, stateCookieOptions(expiresAt));

  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", "identify guilds");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  return url.toString();
}

/**
 * The nonce is deleted on every callback, including malformed and cancelled
 * callbacks.  A valid callback consumes the server-side nonce before any
 * network request, so replay cannot repeat a token exchange.
 */
export function consumeDiscordOAuthState(req: Request, res: Response, state: string | undefined): boolean {
  return consumeDiscordOAuthRequest(req, res, state) !== null;
}

export function consumeDiscordOAuthRequest(req: Request, res: Response, state: string | undefined): PendingOAuthState | null {
  const cookieState = parseCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
  res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions());
  clearExpiredStates();

  // Delete the browser-bound nonce even when an attacker supplied a different
  // query value, preventing a later reuse of the browser's cookie.
  if (!sameSecret(state, cookieState) || !state) {
    if (cookieState) pendingStates.delete(cookieState);
    if (state) pendingStates.delete(state);
    return null;
  }
  const pending = pendingStates.get(state);
  if (!pending || pending.expiresAt <= Date.now()) {
    pendingStates.delete(state);
    return null;
  }
  pendingStates.delete(state);
  return pending;
}

export async function exchangeDiscordOAuthCode(code: string): Promise<string> {
  const config = getDiscordOAuthConfig();
  if (!config || !code || code.length > 2_000) throw new Error("Discord OAuth exchange is unavailable");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new DiscordOAuthError("Discord OAuth token exchange failed", "token_exchange", response.status);
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new DiscordOAuthError("Discord OAuth token response was invalid", "token_response", response.status);
  }
  const accessToken = (payload as { access_token?: unknown }).access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new DiscordOAuthError("Discord OAuth token response was invalid", "token_response", response.status);
  }
  return accessToken;
}

async function fetchDiscordOAuthJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new DiscordOAuthError("Discord OAuth API request failed", "oauth_api", response.status);
  try {
    return await response.json() as T;
  } catch {
    throw new DiscordOAuthError("Discord OAuth API response was invalid", "oauth_response", response.status);
  }
}

function parseIdentity(payload: unknown): string {
  const id = payload && typeof payload === "object" ? (payload as { id?: unknown }).id : undefined;
  if (typeof id !== "string" || !SNOWFLAKE.test(id)) throw new Error("Discord OAuth identity response was invalid");
  return id;
}

function parseGuilds(payload: unknown): DiscordOAuthGuild[] {
  if (!Array.isArray(payload)) throw new Error("Discord OAuth guild response was invalid");
  return payload.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as { id?: unknown; name?: unknown };
    return typeof item.id === "string" && SNOWFLAKE.test(item.id) && typeof item.name === "string"
      ? [{ id: item.id, name: item.name }]
      : [];
  });
}

export async function fetchDiscordOAuthIdentity(accessToken: string): Promise<DiscordOAuthIdentity> {
  const identity = await fetchDiscordOAuthJson<unknown>("/users/@me", accessToken);
  const guilds = await fetchDiscordOAuthJson<unknown>("/users/@me/guilds", accessToken);
  return { id: parseIdentity(identity), guilds: parseGuilds(guilds) };
}

function encodedId(value: string): string {
  return encodeURIComponent(value);
}

async function fetchDiscordBotJson<T>(path: string, token: string): Promise<{ status: number; value: T | null }> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: { authorization: `Bot ${token}` },
  });
  if (response.status === 404) return { status: response.status, value: null };
  if (!response.ok) throw new Error("Discord bot verification request failed");
  return { status: response.status, value: await response.json() as T };
}

/**
 * REST-only verification is used when the gateway client is deliberately
 * disabled in development.  It fetches the guild, member, and roles fresh for
 * every authorization check; OAuth's guild permission field is never trusted.
 */
export async function fetchBotGuildSnapshot(guildId: string, userId: string): Promise<DiscordRestGuildSnapshot | null> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) return null;
  const guildResult = await fetchDiscordBotJson<{ id?: unknown; name?: unknown; owner_id?: unknown }>(
    `/guilds/${encodedId(guildId)}`,
    token,
  );
  if (!guildResult.value) return null;
  const guild = guildResult.value;
  if (guild.id !== guildId || typeof guild.name !== "string" || typeof guild.owner_id !== "string") return null;
  const memberResult = await fetchDiscordBotJson<{ user?: { id?: unknown }; roles?: unknown; permissions?: unknown }>(
    `/guilds/${encodedId(guildId)}/members/${encodedId(userId)}`,
    token,
  );
  const rolesResult = await fetchDiscordBotJson<Array<{ id?: unknown; permissions?: unknown }>>(
    `/guilds/${encodedId(guildId)}/roles`,
    token,
  );
  if (!memberResult.value || !rolesResult.value || !Array.isArray(rolesResult.value)) return null;
  const member = memberResult.value;
  const memberId = member.user?.id;
  if (memberId !== userId || !Array.isArray(member.roles)) return null;
  const roles = rolesResult.value.flatMap((role) =>
    typeof role.id === "string" && typeof role.permissions === "string"
      ? [{ id: role.id, permissions: role.permissions }]
      : [],
  );
  return {
    guild: { id: guild.id, name: guild.name, ownerId: guild.owner_id },
    member: {
      id: memberId,
      roleIds: member.roles.filter((role): role is string => typeof role === "string" && SNOWFLAKE.test(role)),
      permissions: typeof member.permissions === "string" ? member.permissions : undefined,
    },
    roles,
  };
}

export function getVerificationWebsiteUrl(guildId: string): string {
  const configuredOrigin = process.env.MODERATION_WEB_ORIGIN?.trim();
  const redirectUri = configuredOrigin || configuredRedirectUri(process.env.DISCORD_OAUTH_REDIRECT_URI);
  if (redirectUri) {
    try {
      const origin = new URL(redirectUri).origin;
      return new URL(`/verificare?guildId=${encodeURIComponent(guildId)}`, origin).toString();
    } catch {
      // Use the relative portal link below.
    }
  }
  return `/verificare?guildId=${encodeURIComponent(guildId)}`;
}

export function getDiscordBotInviteUrl(guildId: string): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "bot applications.commands");
  // View channel, send messages, embed links, read history, and manage roles.
  url.searchParams.set("permissions", "268504064");
  url.searchParams.set("guild_id", guildId);
  url.searchParams.set("disable_guild_select", "true");
  return url.toString();
}

/** Test-only cleanup that does not weaken production replay protection. */
export function resetDiscordOAuthStateForTests(): void {
  pendingStates.clear();
}

export const DISCORD_OAUTH_STATE_COOKIE = OAUTH_STATE_COOKIE;
export const DISCORD_OAUTH_STATE_TTL_MS = OAUTH_STATE_TTL_MS;