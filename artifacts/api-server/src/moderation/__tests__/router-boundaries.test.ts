import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), access: vi.fn(), csrf: vi.fn(), client: vi.fn(),
  getConfig: vi.fn(), putConfig: vi.fn(), putProtectionToggle: vi.fn(), listCases: vi.fn(),
  listAudit: vi.fn(), listLogs: vi.fn(), beginAction: vi.fn(), getAction: vi.fn(),
  completeAction: vi.fn(), writeAudit: vi.fn(), execute: vi.fn(),
  loadChannelConfig: vi.fn(), saveChannelConfig: vi.fn(),
  loadProvisioningPermissions: vi.fn(), saveProvisioningPermissions: vi.fn(),
  loadAllianceRecruitmentText: vi.fn(), saveAllianceRecruitmentText: vi.fn(),
  loadTicketConfig: vi.fn(), saveTicketConfig: vi.fn(),
  initGameplayConfig: vi.fn(), getGameplayConfig: vi.fn(), saveGuildGameplayConfig: vi.fn(),
  initChannelConfig: vi.fn(),
  loadVerificationConfig: vi.fn(), saveVerificationConfig: vi.fn(),
  loadInviteTrackingConfig: vi.fn(), saveInviteTrackingConfig: vi.fn(),
  defaultInviteTrackingConfig: {
    enabled: false,
    joinLogChannelId: "",
    reportEnabled: false,
    reportChannelId: "",
    reportFrequency: "daily",
    reportTime: "09:00",
    reportWeekday: 1,
    reportTimeZone: "Europe/Bucharest",
    reportTopLimit: 5,
  },
  provisionGuildChannels: vi.fn(),
  emojiCreate: vi.fn(), emojiFetch: vi.fn(),
}));

vi.mock("../auth", () => ({
  ModerationAuthError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  requireSession: mocks.session,
  assertGuildAccess: mocks.access,
  assertCsrf: mocks.csrf,
  getModerationClient: mocks.client,
  assertTrustedOrigin: vi.fn(),
  assertLoginRateLimit: vi.fn(),
  assertMutationRateLimit: vi.fn(),
  clearSessionCookie: vi.fn(),
  listAccessibleGuilds: vi.fn(),
  revokeRequestSessionIfPresent: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("../store", () => ({
  moderationStore: {
    getConfig: mocks.getConfig, putConfig: mocks.putConfig, putProtectionToggle: mocks.putProtectionToggle,
    listCases: mocks.listCases, listAudit: mocks.listAudit,
    listModerationLogs: mocks.listLogs, pruneCases: vi.fn(),
    beginAction: mocks.beginAction, getAction: mocks.getAction, completeAction: mocks.completeAction,
    writeAudit: mocks.writeAudit,
  },
}));
vi.mock("../../bot/moderation/engine", () => ({ executeModerationAction: mocks.execute }));
vi.mock("../../bot/db", () => ({
  loadChannelConfig: mocks.loadChannelConfig,
  saveChannelConfig: mocks.saveChannelConfig,
  loadProvisioningPermissions: mocks.loadProvisioningPermissions,
  saveProvisioningPermissions: mocks.saveProvisioningPermissions,
  loadAllianceRecruitmentText: mocks.loadAllianceRecruitmentText,
  saveAllianceRecruitmentText: mocks.saveAllianceRecruitmentText,
  loadTicketConfig: mocks.loadTicketConfig,
  saveTicketConfig: mocks.saveTicketConfig,
  loadVerificationConfig: mocks.loadVerificationConfig,
  saveVerificationConfig: mocks.saveVerificationConfig,
  loadInviteTrackingConfig: mocks.loadInviteTrackingConfig,
  saveInviteTrackingConfig: mocks.saveInviteTrackingConfig,
  DEFAULT_INVITE_TRACKING_CONFIG: mocks.defaultInviteTrackingConfig,
  INVITE_REPORT_TIME_ZONES: ["Europe/Bucharest", "Europe/Paris", "UTC"],
}));
vi.mock("../../bot/gameplay-store", () => ({
  initGameplayConfig: mocks.initGameplayConfig,
  getGameplayConfig: mocks.getGameplayConfig,
  saveGuildGameplayConfig: mocks.saveGuildGameplayConfig,
}));
vi.mock("../../bot/channel-config", () => ({ initChannelConfig: mocks.initChannelConfig }));
vi.mock("../../bot/channel-provisioning", () => ({ provisionGuildChannels: mocks.provisionGuildChannels }));

import router, { provisioningPermissionSchema } from "../router";

describe("bot-control provisioning permission defaults", () => {
  it("fills missing fields while preserving explicitly saved permission values", () => {
    const permissions = provisioningPermissionSchema.parse({
      roleIds: ["11111111111111111"],
      sendMessages: false,
      rolePermissions: {
        "22222222222222222": { viewChannel: false },
      },
    });

    expect(permissions).toEqual({
      roleIds: ["11111111111111111"],
      readMessageHistory: true,
      sendMessages: false,
      rolePermissions: {
        "22222222222222222": {
          viewChannel: false,
          readMessageHistory: true,
          sendMessages: true,
        },
      },
    });
  });
});
import { ModerationAuthError } from "../auth";
import { defaultModerationConfig } from "../config";
import { DEFAULT_GAMEPLAY_CONFIG } from "../../bot/gameplay-config";
import { DEFAULT_TICKET_CONFIG } from "../../bot/ticket-config";

type BotControlResponse = {
  provisioningPermissions: Record<string, {
    roleIds: string[];
    readMessageHistory: boolean;
    sendMessages: boolean;
    rolePermissions?: Record<string, { viewChannel: boolean; readMessageHistory: boolean; sendMessages: boolean }>;
  }>;
  tickets: {
    staffReviewRoleId: string;
    alliancePublicChannelId: string;
    flows: {
      staff: { completionAction: string; title: string; questions: Array<{ key: string; label: string }> };
      partnership: { completionAction: string; staffNotificationMessage: string; questions: Array<{ key: string; label: string }> };
      help_report: { completionAction: string; questions: Array<{ key: string; label: string }> };
    };
  };
};

describe("moderation HTTP authorization and mutation boundaries", () => {
  let server: Server;
  let base: string;
  const guildId = "123456789";
  const actorId = "987654321";
  let persistedTicketConfig = structuredClone(DEFAULT_TICKET_CONFIG);
  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "400kb" }));
    app.use("/moderation", router);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    base = `http://127.0.0.1:${address.port}/moderation/guilds/${guildId}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: actorId, csrfToken: "csrf" });
    mocks.access.mockResolvedValue("owner");
    mocks.getConfig.mockResolvedValue({ config: structuredClone(defaultModerationConfig), version: 3 });
    mocks.putConfig.mockResolvedValue({ config: structuredClone(defaultModerationConfig), version: 4 });
    mocks.putProtectionToggle.mockResolvedValue({
      config: structuredClone(defaultModerationConfig),
      previousConfig: structuredClone(defaultModerationConfig),
      version: 4,
    });
    mocks.client.mockReturnValue({
      isReady: () => true,
      options: { intents: { has: () => true } },
      guilds: { fetch: vi.fn().mockResolvedValue({
        id: guildId,
        name: "Regatul test",
        ownerId: actorId,
        members: { me: { permissions: { has: () => true } } },
        roles: { fetch: vi.fn().mockResolvedValue(new Map()) },
        channels: { fetch: vi.fn().mockResolvedValue(new Map()) },
        emojis: {
          fetch: mocks.emojiFetch,
          create: mocks.emojiCreate,
        },
      }) },
    });
    mocks.listCases.mockResolvedValue([]);
    mocks.listAudit.mockResolvedValue({ items: [], total: 0 });
    mocks.listLogs.mockResolvedValue([]);
    mocks.beginAction.mockResolvedValue({ created: true, action: { id: "ledger", status: "pending" } });
    mocks.getAction.mockResolvedValue(null);
    mocks.execute.mockResolvedValue({ actionId: "action", summary: "applied" });
    persistedTicketConfig = structuredClone(DEFAULT_TICKET_CONFIG);
    mocks.loadChannelConfig.mockResolvedValue({ main: "111111111" });
    mocks.saveChannelConfig.mockResolvedValue(undefined);
    mocks.loadProvisioningPermissions.mockResolvedValue({});
    mocks.saveProvisioningPermissions.mockResolvedValue(undefined);
    mocks.loadAllianceRecruitmentText.mockResolvedValue("Text salvat");
    mocks.saveAllianceRecruitmentText.mockResolvedValue(undefined);
    mocks.loadTicketConfig.mockImplementation(async () => structuredClone(persistedTicketConfig));
    mocks.saveTicketConfig.mockImplementation(async (_guildId, config) => {
      persistedTicketConfig = structuredClone(config);
    });
    mocks.initGameplayConfig.mockResolvedValue(undefined);
    mocks.getGameplayConfig.mockReturnValue(structuredClone(DEFAULT_GAMEPLAY_CONFIG));
    mocks.saveGuildGameplayConfig.mockResolvedValue(structuredClone(DEFAULT_GAMEPLAY_CONFIG));
    mocks.initChannelConfig.mockResolvedValue(undefined);
    mocks.loadVerificationConfig.mockResolvedValue(null);
    mocks.saveVerificationConfig.mockResolvedValue(undefined);
    mocks.loadInviteTrackingConfig.mockResolvedValue(structuredClone(mocks.defaultInviteTrackingConfig));
    mocks.saveInviteTrackingConfig.mockResolvedValue(undefined);
    mocks.provisionGuildChannels.mockResolvedValue({
      channelConfig: { main: "111111111" },
      ticketConfig: structuredClone(DEFAULT_TICKET_CONFIG),
      moderationConfig: structuredClone(defaultModerationConfig),
      verification: {
        enabled: false, channelId: "777777777", roleId: "", title: "Verificare", message: "Mesaj",
        buttonLabel: "Verifică", buttonEmoji: "✅", successMessage: "Gata", alreadyVerifiedMessage: "Deja", panelMessageId: "",
      },
      created: [{ key: "main", id: "111111111", name: "cufere-si-oracol", type: "text" }],
      reused: [],
    });
    mocks.emojiCreate.mockResolvedValue({ id: "888888888", name: "cenusa", animated: false });
    mocks.emojiFetch.mockResolvedValue(new Map());
  });
  const post = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  const botControlPayload = () => {
    const flow = (name: string, action: "lock" | "notify_staff" | "keep_open") => ({
      mode: "custom" as const,
      title: `${name} title`,
      startButtonLabel: `${name} start`,
      panelDescription: `${name} panel`,
      requirementsText: `${name} requirements`,
      completionMessage: `${name} completed`,
      staffNotificationMessage: `${name} staff`,
      completionAction: action,
      questions: [
        {
          key: `${name.toLowerCase()}_first`,
          label: `${name} first`,
          description: `${name} first question`,
          placeholder: "First answer",
          multiline: false,
          required: true,
        },
        {
          key: `${name.toLowerCase()}_second`,
          label: `${name} second`,
          description: `${name} second question`,
          placeholder: "Second answer",
          multiline: true,
          required: false,
        },
      ],
    });
    return {
      channels: { main: "111111111" },
      provisioningPermissions: {},
      allianceRecruitmentText: "Mesajul alianței",
      tickets: {
        categories: {
          staff: "222222222",
          partnership: "333333333",
          help_report: "444444444",
        },
        staffReviewRoleId: "555555555",
        alliancePublicChannelId: "666666666",
        allianceOwnerGuildId: guildId,
        incompleteTimeoutMinutes: 60,
        firstWarningMinutes: 20,
        secondWarningMinutes: 50,
        flows: {
          staff: flow("Staff", "notify_staff"),
          partnership: flow("Partnership", "keep_open"),
          help_report: flow("Help", "lock"),
        },
      },
      gameplayConfig: structuredClone(DEFAULT_GAMEPLAY_CONFIG),
    };
  };

  it("rejects unauthenticated configuration reads before reading stored data", async () => {
    mocks.session.mockRejectedValue(new ModerationAuthError(401, "Authentication required"));
    expect((await fetch(`${base}/config`)).status).toBe(401);
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("checks owner settings access with the URL guild and server session identity", async () => {
    mocks.access.mockRejectedValue(new ModerationAuthError(403, "Owner only"));
    expect((await fetch(`${base}/config`)).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(guildId, actorId, "config");
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("checks CSRF before creating any action", async () => {
    mocks.csrf.mockImplementation(() => { throw new ModerationAuthError(403, "CSRF required"); });
    expect((await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }))).status).toBe(403);
    expect(mocks.beginAction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  describe("guild emoji upload", () => {
    const validPng = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString("base64")}`;

    it("requires authentication before touching Discord", async () => {
      mocks.session.mockRejectedValue(new ModerationAuthError(401, "Authentication required"));
      const response = await fetch(`${base}/emojis`, post({ name: "cenusa", image: validPng }));
      expect(response.status).toBe(401);
      expect(mocks.access).not.toHaveBeenCalled();
      expect(mocks.emojiCreate).not.toHaveBeenCalled();
    });

    it("enforces CSRF and selected-guild owner access", async () => {
      mocks.csrf.mockImplementationOnce(() => { throw new ModerationAuthError(403, "CSRF required"); });
      expect((await fetch(`${base}/emojis`, post({ name: "cenusa", image: validPng }))).status).toBe(403);
      expect(mocks.emojiCreate).not.toHaveBeenCalled();

      mocks.access.mockRejectedValueOnce(new ModerationAuthError(403, "Owner only"));
      expect((await fetch(`${base}/emojis`, post({ name: "cenusa", image: validPng }))).status).toBe(403);
      expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "config");
      expect(mocks.emojiCreate).not.toHaveBeenCalled();
    });

    it.each([
      [{ name: "bad name!", image: validPng }, "invalid name"],
      [{ name: "cenusa", image: "data:text/html;base64,PGgxPm5vPC9oMT4=" }, "invalid MIME"],
      [{ name: "cenusa", image: `data:image/png;base64,${Buffer.alloc(256 * 1024 + 1).toString("base64")}` }, "oversized image"],
    ])("rejects %s (%s) without a Discord mutation", async (payload) => {
      const response = await fetch(`${base}/emojis`, post(payload));
      expect(response.status).toBe(400);
      expect(mocks.emojiCreate).not.toHaveBeenCalled();
    });

    it("creates the emoji on the authorized URL guild and returns refreshed metadata shape", async () => {
      const response = await fetch(`${base}/emojis`, post({ name: "cenusa", image: validPng }, { "x-csrf-token": "csrf" }));
      expect(response.status).toBe(201);
      expect(mocks.access).toHaveBeenCalledWith(guildId, actorId, "config");
      expect(mocks.emojiCreate).toHaveBeenCalledWith(expect.objectContaining({
        name: "cenusa",
        attachment: expect.any(Buffer),
      }));
      await expect(response.json()).resolves.toMatchObject({
        id: "888888888",
        name: "cenusa",
        markup: "<:cenusa:888888888>",
        url: expect.stringContaining("/888888888.png"),
      });

      mocks.emojiFetch.mockResolvedValue(new Map([
        ["888888888", { id: "888888888", name: "cenusa", animated: false }],
      ]));
      const metadataResponse = await fetch(`${base}/metadata`);
      expect(metadataResponse.status).toBe(200);
      await expect(metadataResponse.json()).resolves.toMatchObject({
        guild: { id: guildId },
        emojis: [{ id: "888888888", markup: "<:cenusa:888888888>" }],
      });
    });
  });

  it("requires a configuration revision and passes it to the compare-and-swap write", async () => {
    const init = { ...post(defaultModerationConfig), method: "PUT" };
    expect((await fetch(`${base}/config`, init)).status).toBe(428);
    expect(mocks.putConfig).not.toHaveBeenCalled();
    const response = await fetch(`${base}/config`, {
      ...init, headers: { ...init.headers, "if-match": '"3"' },
    });
    expect(response.status).toBe(200);
    expect(mocks.putConfig).toHaveBeenCalledWith(guildId, expect.any(Object), actorId, 3);
    expect(response.headers.get("etag")).toBe('"4"');
  });

  it("rejects unknown sections and fields instead of silently reporting a successful save", async () => {
    for (const payload of [
      { ...defaultModerationConfig, embed: { titleTemplate: "Lost title" } },
      { ...defaultModerationConfig, embeds: { ...defaultModerationConfig.embeds, titleTemplte: "Lost title" } },
    ]) {
      const response = await fetch(`${base}/config`, {
        ...post(payload, { "if-match": '"3"' }), method: "PUT",
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("Unknown configuration field") });
    }
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });

  it("checks the revision before any Discord configuration side effects", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.activityLog.enabled = true;
    config.activityLog.roleIds = ["111111111111111111"];
    const response = await fetch(`${base}/config`, {
      ...post(config, { "if-match": '"2"' }), method: "PUT",
    });
    expect(response.status).toBe(409);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });

  it("allows an embed-only save when an old configured channel was deleted from Discord", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.audit.channelId = "555555555555555555";
    mocks.getConfig.mockResolvedValue({ config, version: 3 });
    const next = structuredClone(config);
    next.embeds.titleTemplate = "Updated title";
    const response = await fetch(`${base}/config`, {
      ...post(next, { "if-match": '"3"' }), method: "PUT",
    });
    expect(response.status).toBe(200);
    expect(mocks.putConfig).toHaveBeenCalledWith(guildId, next, actorId, 3);
  });

  it("announces module activation when a settings page saves through the full-config endpoint", async () => {
    const channelId = "555555555555555555";
    const previousConfig = structuredClone(defaultModerationConfig);
    previousConfig.audit.channelId = channelId;
    previousConfig.audit.enabled = false;
    const config = structuredClone(previousConfig);
    config.escalation.enabled = true;
    mocks.getConfig.mockResolvedValue({ config: previousConfig, version: 3 });
    mocks.putConfig.mockResolvedValue({ config, version: 4 });

    const send = vi.fn().mockResolvedValue({});
    const channel = { isTextBased: () => true, send };
    const guild = {
      id: guildId,
      ownerId: actorId,
      members: { me: { permissions: { has: () => false } } },
      roles: { fetch: vi.fn().mockResolvedValue(new Map()) },
      channels: {
        cache: new Map([[channelId, channel]]),
        fetch: vi.fn().mockImplementation(async (id?: string) =>
          id ? channel : new Map([[channelId, channel]]),
        ),
      },
      emojis: { fetch: mocks.emojiFetch, create: mocks.emojiCreate },
    };
    mocks.client.mockReturnValue({
      isReady: () => true,
      options: { intents: { has: () => true } },
      guilds: { cache: new Map([[guildId, guild]]), fetch: vi.fn().mockResolvedValue(guild) },
    });

    const response = await fetch(`${base}/config`, {
      ...post(config, { "if-match": '"3"' }),
      method: "PUT",
    });

    expect(response.status).toBe(200);
    const result = await response.json() as {
      notification: { status: string; modules: string[] };
    };
    expect(result.notification).toEqual({ status: "sent", modules: ["Escaladarea"] });
    expect(send).toHaveBeenCalledOnce();
  });

  it.each([
    "protection",
    "autoMod",
    "wordFilter",
    "linkBlock",
    "antiRaid",
    "antiSpam",
    "antiFlood",
    "suspiciousBehavior",
    "ai",
    "manualTools",
    "cases",
    "audit",
    "escalation",
    "embeds",
  ] as const)("saves disabling the %s protection toggle and returns the new revision", async (key) => {
    const initialConfig = structuredClone(defaultModerationConfig);
    initialConfig.protection.enabled = true;
    initialConfig.autoMod.enabled = true;
    initialConfig.autoMod.wordFilter.enabled = true;
    initialConfig.autoMod.linkBlock.enabled = true;
    initialConfig.antiRaid.enabled = true;
    initialConfig.antiSpam.enabled = true;
    initialConfig.antiFlood.enabled = true;
    initialConfig.ai.enabled = true;
    initialConfig.suspiciousBehavior.enabled = true;
    initialConfig.manualTools.enabled = true;
    initialConfig.cases.enabled = true;
    initialConfig.audit.enabled = true;
    initialConfig.escalation.enabled = true;
    initialConfig.embeds.enabled = true;
    mocks.getConfig.mockResolvedValue({ config: initialConfig, version: 8 });
    mocks.putProtectionToggle.mockImplementation(async (_guildId, key, enabled, _updatedBy) => {
      const config = structuredClone(initialConfig);
      if (key === "protection") config.protection.enabled = enabled;
      else if (key === "autoMod") config.autoMod.enabled = enabled;
      else if (key === "wordFilter") config.autoMod.wordFilter.enabled = enabled;
      else if (key === "linkBlock") config.autoMod.linkBlock.enabled = enabled;
      else if (key === "antiRaid") config.antiRaid.enabled = enabled;
      else if (key === "antiSpam") config.antiSpam.enabled = enabled;
      else if (key === "antiFlood") config.antiFlood.enabled = enabled;
      else if (key === "suspiciousBehavior") config.suspiciousBehavior.enabled = enabled;
      else if (key === "ai") config.ai.enabled = enabled;
      else if (key === "manualTools") config.manualTools.enabled = enabled;
      else if (key === "cases") config.cases.enabled = enabled;
      else if (key === "audit") config.audit.enabled = enabled;
      else if (key === "escalation") config.escalation.enabled = enabled;
      else config.embeds.enabled = enabled;
      return {
        config,
        previousConfig: structuredClone(initialConfig),
        version: 9,
      };
    });

    const response = await fetch(`${base}/protection-toggle`, {
      ...post({ key, enabled: false }),
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"9"');
    const result = await response.json() as { config: typeof initialConfig; version: number };
    expect(result.version).toBe(9);
    expect(result.config).toEqual(expect.objectContaining({
      protection: expect.objectContaining({ enabled: key === "protection" ? false : true }),
      ai: expect.objectContaining({ enabled: key === "ai" ? false : true }),
      antiRaid: expect.objectContaining({ enabled: key === "antiRaid" ? false : true }),
      antiSpam: expect.objectContaining({ enabled: key === "antiSpam" ? false : true }),
      antiFlood: expect.objectContaining({ enabled: key === "antiFlood" ? false : true }),
      suspiciousBehavior: expect.objectContaining({ enabled: key === "suspiciousBehavior" ? false : true }),
      manualTools: expect.objectContaining({ enabled: key === "manualTools" ? false : true }),
      cases: expect.objectContaining({ enabled: key === "cases" ? false : true }),
      audit: expect.objectContaining({ enabled: key === "audit" ? false : true }),
      escalation: expect.objectContaining({ enabled: key === "escalation" ? false : true }),
      embeds: expect.objectContaining({ enabled: key === "embeds" ? false : true }),
    }));
    expect(result.config.autoMod.enabled).toBe(key === "autoMod" ? false : true);
    expect(result.config.autoMod.wordFilter.enabled).toBe(key === "wordFilter" ? false : true);
    expect(result.config.autoMod.linkBlock.enabled).toBe(key === "linkBlock" ? false : true);
    expect(mocks.putProtectionToggle).toHaveBeenCalledWith(guildId, key, false, actorId);
  });

  it("uses the atomic store mutation for a toggle instead of a stale full-config write", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.protection.enabled = false;
    config.ai.enabled = true;
    mocks.putProtectionToggle.mockResolvedValue({
      config,
      previousConfig: structuredClone(config),
      version: 5,
    });

    const response = await fetch(`${base}/protection-toggle`, {
      ...post({ key: "protection", enabled: false }),
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"5"');
    const result = await response.json() as { config: typeof config; version: number };
    expect(result.version).toBe(5);
    expect(result.config).toEqual(config);
    expect(mocks.putProtectionToggle).toHaveBeenCalledWith(guildId, "protection", false, actorId);
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });

  it("announces a newly enabled module in the configured audit channel without pinging anyone", async () => {
    const channelId = "555555555555555555";
    const previousConfig = structuredClone(defaultModerationConfig);
    previousConfig.protection.enabled = true;
    previousConfig.audit.channelId = channelId;
    previousConfig.audit.enabled = false;
    const config = structuredClone(previousConfig);
    config.antiRaid.enabled = true;
    mocks.putProtectionToggle.mockResolvedValue({ config, previousConfig, version: 5 });

    const send = vi.fn().mockResolvedValue({});
    const channel = { isTextBased: () => true, send };
    const guild = {
      id: guildId,
      members: { me: { permissions: { has: () => false } } },
      channels: { cache: new Map(), fetch: vi.fn().mockResolvedValue(channel) },
    };
    mocks.client.mockReturnValue({
      isReady: () => true,
      options: { intents: { has: () => true } },
      guilds: { cache: new Map(), fetch: vi.fn().mockResolvedValue(guild) },
    });

    const response = await fetch(`${base}/protection-toggle`, {
      ...post({ key: "antiRaid", enabled: true }),
      method: "PUT",
    });

    expect(response.status).toBe(200);
    const result = await response.json() as {
      notification: { status: string; module: string };
    };
    expect(result.notification).toEqual({ status: "sent", modules: ["Anti-Raid"] });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("Anti-Raid activat"),
      allowedMentions: { parse: [] },
    }));
  });

  it("persists all custom ticket flows and returns them unchanged after a later GET", async () => {
    const payload = botControlPayload();
    const provisioningPermissions = {
      gameplay: {
        roleIds: ["222222222"],
        readMessageHistory: true,
        sendMessages: false,
        rolePermissions: {
          "222222222": { viewChannel: true, readMessageHistory: true, sendMessages: false },
        },
      },
    };
    payload.provisioningPermissions = provisioningPermissions;
    mocks.loadProvisioningPermissions.mockResolvedValue(provisioningPermissions);
    const putResponse = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(putResponse.status).toBe(200);
    expect(mocks.saveTicketConfig).toHaveBeenCalledWith(guildId, expect.objectContaining({
      staffReviewRoleId: "555555555",
    }));
    expect(mocks.saveTicketConfig.mock.calls[0]?.[1].flows).toEqual(
      expect.objectContaining({
        staff: expect.objectContaining({ mode: "custom" }),
        partnership: expect.objectContaining({ mode: "custom" }),
        help_report: expect.objectContaining({ mode: "custom" }),
      }),
    );
    expect(mocks.saveProvisioningPermissions).toHaveBeenCalledWith(guildId, provisioningPermissions);

    const getResponse = await fetch(`${base}/bot-control`);
    expect(getResponse.status).toBe(200);
    const result = await getResponse.json() as BotControlResponse;
    expect(result.provisioningPermissions).toEqual(provisioningPermissions);
    expect(result.tickets.staffReviewRoleId).toBe("555555555");
    expect(result.tickets.alliancePublicChannelId).toBe("666666666");
    expect(result.tickets.flows.staff.completionAction).toBe("notify_staff");
    expect(result.tickets.flows.partnership.completionAction).toBe("keep_open");
    expect(result.tickets.flows.help_report.completionAction).toBe("lock");
    expect(result.tickets.flows.staff.questions.map((question: { key: string }) => question.key))
      .toEqual(["staff_first", "staff_second"]);
    expect(result.tickets.flows.partnership.questions.map((question: { key: string }) => question.key))
      .toEqual(["partnership_first", "partnership_second"]);
    expect(result.tickets.flows.help_report.questions.map((question: { key: string }) => question.key))
      .toEqual(["help_first", "help_second"]);
    expect(result.tickets.flows.staff.title).toBe("Staff title");
    expect(result.tickets.flows.partnership.staffNotificationMessage).toBe("Partnership staff");
  });

  it("requires Manage Channels and persists the hybrid provisioning result", async () => {
    const guild = {
      members: { me: { permissions: { has: vi.fn().mockReturnValue(false) } } },
    };
    mocks.client.mockReturnValue({
      isReady: () => true,
      options: { intents: { has: () => true } },
      guilds: { fetch: vi.fn().mockResolvedValue(guild) },
    });
    const denied = await fetch(`${base}/bot-control/provision-channels`, post({}));
    expect(denied.status).toBe(403);
    expect(mocks.provisionGuildChannels).not.toHaveBeenCalled();

    guild.members.me.permissions.has.mockReturnValue(true);
    const response = await fetch(`${base}/bot-control/provision-channels`, post({}));
    expect(response.status).toBe(200);
    expect(mocks.provisionGuildChannels).toHaveBeenCalledWith(guild, expect.objectContaining({
      channelConfig: { main: "111111111" },
    }));
    expect(mocks.saveChannelConfig).toHaveBeenCalledWith(guildId, { main: "111111111" });
    expect(mocks.saveVerificationConfig).toHaveBeenCalledWith(guildId, expect.objectContaining({ channelId: "777777777" }));
    const result = await response.json() as { provisioning: { created: unknown[] } };
    expect(result.provisioning.created).toHaveLength(1);
  });

  it("loads verified members through Discord REST instead of the rate-limited gateway request", async () => {
    const roleId = "444444444";
    const restGet = vi.fn().mockResolvedValue([
      {
        nick: "Membru verificat",
        roles: [roleId],
        joined_at: "2026-09-19T12:00:00.000Z",
        user: {
          id: "888888888",
          username: "verified-user",
          global_name: "Membru verificat",
          avatar: null,
          bot: false,
        },
      },
      {
        roles: [roleId],
        user: {
          id: "999999999",
          username: "bot-user",
          global_name: "Bot",
          avatar: null,
          bot: true,
        },
      },
    ]);
    const role = { id: roleId, name: "Verificat" };
    mocks.loadVerificationConfig.mockResolvedValue({ enabled: true, roleId });
    mocks.client.mockReturnValue({
      isReady: () => true,
      rest: { get: restGet },
      guilds: {
        fetch: vi.fn().mockResolvedValue({
          roles: { fetch: vi.fn().mockResolvedValue(role) },
        }),
      },
    });

    const response = await fetch(`${base}/verification/members`);
    expect(response.status).toBe(200);
    expect(restGet).toHaveBeenCalledWith(
      expect.stringContaining(guildId),
      expect.objectContaining({ query: expect.any(URLSearchParams) }),
    );
    const result = await response.json() as {
      total: number;
      members: Array<{ id: string; displayName: string; joinedAt: string | null }>;
    };
    expect(result.total).toBe(1);
    expect(result.members).toEqual([
      expect.objectContaining({
        id: "888888888",
        displayName: "Membru verificat",
        joinedAt: "2026-09-19T12:00:00.000Z",
      }),
    ]);
  });

  it("round-trips a fresh empty alliance message instead of rejecting the whole bot configuration", async () => {
    const payload = botControlPayload();
    payload.allianceRecruitmentText = "";
    const response = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(response.status).toBe(200);
    expect(mocks.saveAllianceRecruitmentText).toHaveBeenCalledWith(guildId, "");
    expect(mocks.initChannelConfig).toHaveBeenCalledWith(guildId);
  });

  it("does not let the bot-control page change the separate gameplay pause state", async () => {
    const payload = botControlPayload();
    mocks.getGameplayConfig.mockReturnValue({
      ...structuredClone(DEFAULT_GAMEPLAY_CONFIG),
      paused: true,
    });
    mocks.saveGuildGameplayConfig.mockImplementation(async (_guildId, config) => config);

    const response = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(response.status).toBe(200);
    expect(mocks.saveGuildGameplayConfig).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({ paused: true }),
    );
  });

  it("rejects an invalid custom ticket payload before changing the existing configuration", async () => {
    const payload = botControlPayload();
    const initialPut = await fetch(`${base}/bot-control`, {
      ...post(payload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });
    expect(initialPut.status).toBe(200);
    mocks.saveTicketConfig.mockClear();
    mocks.saveChannelConfig.mockClear();
    mocks.saveAllianceRecruitmentText.mockClear();
    mocks.saveGuildGameplayConfig.mockClear();

    const invalidPayload = structuredClone(payload);
    invalidPayload.tickets.flows.staff.questions[0].label = "";
    const invalidPut = await fetch(`${base}/bot-control`, {
      ...post(invalidPayload),
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf" },
    });

    expect(invalidPut.status).toBe(400);
    expect(mocks.saveTicketConfig).not.toHaveBeenCalled();
    expect(mocks.saveChannelConfig).not.toHaveBeenCalled();
    expect(mocks.saveAllianceRecruitmentText).not.toHaveBeenCalled();
    expect(mocks.saveGuildGameplayConfig).not.toHaveBeenCalled();

    const getResponse = await fetch(`${base}/bot-control`);
    const result = await getResponse.json() as BotControlResponse;
    expect(result.tickets.flows.staff.questions[0].label).toBe("Staff first");
    expect(result.tickets.flows.partnership.questions[1].key).toBe("partnership_second");
  });

  it("does not accept configured roles belonging to another server", async () => {
    const config = structuredClone(defaultModerationConfig);
    config.permissions.staffRoleIds = ["444444444"];
    const response = await fetch(`${base}/config`, { ...post(config, { "if-match": '"3"' }), method: "PUT" });
    expect(response.status).toBe(400);
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });

  it("keeps ordinary logs separate from owner-only audit", async () => {
    await fetch(`${base}/logs`);
    expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "operations");
    expect(mocks.listLogs).toHaveBeenCalledWith(guildId, 50, 0);
    await fetch(`${base}/logs/audit`);
    expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "audit");
    expect(mocks.listAudit).toHaveBeenCalledWith(guildId, {
      search: "",
      category: "all",
      start: undefined,
      end: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("applies validated audit filters through the authorized guild-scoped query", async () => {
    const response = await fetch(
      `${base}/logs/audit?search=actor&category=members&start=2026-09-24T10%3A00%3A00.000Z&end=2026-09-24T12%3A00%3A00.000Z&limit=25&offset=50`,
    );
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenLastCalledWith(guildId, actorId, "audit");
    expect(mocks.listAudit).toHaveBeenCalledWith(guildId, {
      search: "actor",
      category: "members",
      start: new Date("2026-09-24T10:00:00.000Z"),
      end: new Date("2026-09-24T12:00:00.000Z"),
      limit: 25,
      offset: 50,
    });
    await expect(response.json()).resolves.toMatchObject({ items: [], total: 0, limit: 25, offset: 50 });
  });

  it.each([
    "start=not-a-date",
    "start=2026-09-24T12%3A00%3A00.000Z&end=2026-09-24T10%3A00%3A00.000Z",
    "category=unknown",
  ])("rejects invalid audit filters (%s) before querying", async (query) => {
    expect((await fetch(`${base}/logs/audit?${query}`)).status).toBe(400);
    expect(mocks.listAudit).not.toHaveBeenCalled();
  });

  it("preserves audit guild authorization before querying filtered records", async () => {
    mocks.access.mockRejectedValueOnce(new ModerationAuthError(403, "Forbidden"));
    expect((await fetch(`${base}/logs/audit?category=members`)).status).toBe(403);
    expect(mocks.listAudit).not.toHaveBeenCalled();
  });

  it("rejects unbounded pagination before running the cases query", async () => {
    expect((await fetch(`${base}/cases?limit=100000`)).status).toBe(400);
    expect(mocks.listCases).not.toHaveBeenCalled();
  });

  it("requires an idempotency key for destructive web actions", async () => {
    expect((await fetch(`${base}/actions`, post({ type: "ban", targetId: "555555555" }))).status).toBe(400);
    expect(mocks.beginAction).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("never trusts a client-supplied actor, guild, or automatic-enforcement source", async () => {
    const response = await fetch(`${base}/actions`, post({
      type: "warn", targetId: "555555555", actorId: "111111111",
      guildId: "222222222", source: "automod",
    }, { "idempotency-key": "test-action-unique-01" }));
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ guildId, actorId, type: "warn" }));
    const input = mocks.execute.mock.calls[0]?.[0];
    expect(input.source).not.toBe("automod");
  });

  it("returns a completed action without repeating its Discord side effect", async () => {
    mocks.getAction.mockResolvedValue({
      id: "ledger", status: "applied", result: { summary: "Already applied" },
    });
    const response = await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }, {
      "idempotency-key": "test-action-unique-02",
    }));
    expect(response.status).toBe(200);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not repeat a pending or uncertain action", async () => {
    mocks.getAction.mockResolvedValue({ id: "ledger", status: "pending" });
    const response = await fetch(`${base}/actions`, post({ type: "warn", targetId: "555555555" }, {
      "idempotency-key": "test-action-unique-03",
    }));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([0, 600, 21600])("passes slowmode %i seconds unchanged, including disabling it", async (amount) => {
    const response = await fetch(`${base}/actions`, post({
      type: "slowmode", channelId: "555555555", amount,
    }, { "idempotency-key": `test-slowmode-${amount}-unique` }));
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      guildId, actorId, type: "slowmode", channelId: "555555555", amount,
    }));
  });

  it.each([
    { type: "purge", channelId: "555555555", amount: 0 },
    { type: "purge", channelId: "555555555", amount: 101 },
    { type: "purge", amount: 10 },
    { type: "slowmode", channelId: "555555555" },
    { type: "slowmode", channelId: "555555555", amount: 21601 },
    { type: "lock" },
    { type: "unlock" },
    { type: "nick", targetId: "555555555" },
    { type: "role", targetId: "555555555" },
  ])("rejects incomplete command $type before calling Discord", async (payload) => {
    const response = await fetch(`${base}/actions`, post(payload, {
      "idempotency-key": "test-missing-argument-unique",
    }));
    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});