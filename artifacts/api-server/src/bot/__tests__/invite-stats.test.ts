import { describe, expect, it } from "vitest";
import { DEFAULT_INVITE_TRACKING_CONFIG, normalizeInviteTrackingConfig } from "../db";
import {
  allocateInviteUseCredits,
  buildInviteJoinLogEmbed,
  buildInviteStatsEmbed,
  getDueInviteReportPeriod,
  resolveInviteCodesForJoinBatch,
  type InviteStatsResponse,
} from "../invite-stats";

describe("invite statistics attribution", () => {
  it("attributes only as many joins as there are confirmed invite-use credits", () => {
    const pendingUses = new Map([
      ["alpha", 2],
      ["beta", 1],
    ]);

    const attributed = allocateInviteUseCredits(2, pendingUses);

    expect(attributed).toEqual(new Map([["alpha", 2]]));
    expect(pendingUses).toEqual(new Map([["beta", 1]]));
  });

  it("keeps joins without a confirmed invite use in the unknown bucket", () => {
    const pendingUses = new Map([["alpha", 1]]);

    expect(allocateInviteUseCredits(3, pendingUses)).toEqual(new Map([
      ["alpha", 1],
      ["", 2],
    ]));
    expect(pendingUses.size).toBe(0);
  });
});

describe("invite join log attribution", () => {
  it("attributes a batch only when one invite accounts for every joined member", () => {
    expect(resolveInviteCodesForJoinBatch(2, new Map([["alpha", 2]]))).toEqual(["alpha", "alpha"]);
    expect(resolveInviteCodesForJoinBatch(2, new Map([["alpha", 1], ["beta", 1]]))).toEqual([null, null]);
    expect(resolveInviteCodesForJoinBatch(1, new Map())).toEqual([null]);
  });

  it("builds a member and inviter log entry without triggering mentions", () => {
    const embed = buildInviteJoinLogEmbed("Server", {
      memberId: "111111111",
      inviteCode: "alpha",
      inviterId: "222222222",
      inviterName: "Inviter",
      attributionAmbiguous: false,
    }).toJSON();

    expect(embed.title).toBe("A intrat un membru nou");
    expect(embed.description).toContain("<@111111111>");
    expect(embed.description).toContain("<@222222222>");
    expect(embed.description).toContain("alpha");
  });

  it("defaults the optional join-log channel for previously saved settings", () => {
    expect(normalizeInviteTrackingConfig({
      enabled: true,
      reportEnabled: false,
      reportChannelId: "",
      reportFrequency: "daily",
      reportTime: "09:00",
      reportWeekday: 1,
      reportTimeZone: "UTC",
      reportTopLimit: 5,
    }).joinLogChannelId).toBe("");
  });
});

describe("scheduled invite report periods", () => {
  it("respects the configured timezone and report time", () => {
    const config = {
      ...DEFAULT_INVITE_TRACKING_CONFIG,
      enabled: true,
      reportEnabled: true,
      reportTime: "10:00",
      reportTimeZone: "Europe/Bucharest" as const,
    };

    expect(getDueInviteReportPeriod(config, Date.parse("2026-02-02T07:59:00.000Z"))).toBeNull();
    expect(getDueInviteReportPeriod(config, Date.parse("2026-02-02T08:00:00.000Z"))).toMatchObject({
      startDay: "2026-02-01",
      endDay: "2026-02-01",
      reportKey: "daily:2026-02-01",
      frequency: "daily",
    });
  });

  it("creates a seven-day report ending the day before the scheduled weekday", () => {
    const config = {
      ...DEFAULT_INVITE_TRACKING_CONFIG,
      enabled: true,
      reportEnabled: true,
      reportFrequency: "weekly" as const,
      reportWeekday: 1,
      reportTime: "09:00",
      reportTimeZone: "Europe/Bucharest" as const,
    };

    expect(getDueInviteReportPeriod(config, Date.parse("2026-01-05T07:00:00.000Z"))).toMatchObject({
      startDay: "2025-12-29",
      endDay: "2026-01-04",
      reportKey: "weekly:2026-01-04",
      frequency: "weekly",
    });
    expect(getDueInviteReportPeriod(config, Date.parse("2026-01-06T07:00:00.000Z"))).toBeNull();
  });
});

describe("invite report embed", () => {
  it("shows attributed links and unknown joins without allowing user mentions", () => {
    const period = {
      startDay: "2026-09-23",
      endDay: "2026-09-23",
      reportKey: "daily:2026-09-23",
      frequency: "daily" as const,
    };
    const stats: InviteStatsResponse = {
      range: "7",
      startDay: "2026-09-23",
      endDay: "2026-09-23",
      totals: { attributedJoins: 4, unknownJoins: 2 },
      rows: [{
        code: "alpha",
        url: "https://discord.gg/alpha",
        inviterId: "123456789",
        inviterName: "@everyone",
        channelId: null,
        totalDiscordUses: 4,
        attributedJoins: 4,
        maxUses: null,
        expiresAt: null,
        active: true,
        lastSyncedAt: null,
      }],
    };

    const embed = buildInviteStatsEmbed("Server", period, stats, 5).toJSON();

    expect(embed.description).toContain("alpha");
    expect(embed.description).toContain("@​everyone");
    expect(embed.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Intrări atribuite", value: "4" }),
      expect.objectContaining({ name: "Neatribuite", value: "2" }),
    ]));
  });
});