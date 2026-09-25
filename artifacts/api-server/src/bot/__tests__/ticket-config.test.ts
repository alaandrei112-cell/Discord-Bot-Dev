import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKET_CONFIG,
  normalizeTicketConfig,
  type TicketCategoryKind,
  type TicketFlowConfig,
} from "../ticket-config";
import { ticketFlowConfigSchema } from "../../moderation/router";

const KINDS: TicketCategoryKind[] = ["staff", "partnership", "help_report"];

function question(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    label: `Întrebarea ${key}`,
    description: `Descrierea pentru ${key}`,
    placeholder: `Răspuns pentru ${key}`,
    multiline: false,
    required: true,
    ...overrides,
  };
}

function flow(kind: TicketCategoryKind, overrides: Partial<TicketFlowConfig> = {}) {
  return {
    mode: "custom" as const,
    title: `Panou ${kind}`,
    startButtonLabel: `Începe ${kind}`,
    panelDescription: `Descriere ${kind}`,
    requirementsText: `Cerințe ${kind}`,
    completionMessage: `Completat ${kind}`,
    staffNotificationMessage: `Staff ${kind}`,
    completionAction: "keep_open" as const,
    questions: [question(`${kind}_first`)],
    ...overrides,
  };
}

describe("custom ticket flow configuration", () => {
  it("validates and normalizes independent custom flows for all three ticket types", () => {
    const rawFlows = Object.fromEntries(
      KINDS.map((kind) => [kind, flow(kind)]),
    );
    const normalized = normalizeTicketConfig({
      staffReviewRoleId: "211111111111111111",
      flows: rawFlows,
    });

    for (const kind of KINDS) {
      expect(normalized.flows[kind]).toMatchObject({
        mode: "custom",
        title: `Panou ${kind}`,
        startButtonLabel: `Începe ${kind}`,
        completionMessage: `Completat ${kind}`,
        staffNotificationMessage: `Staff ${kind}`,
        completionAction: "keep_open",
      });
      expect(normalized.flows[kind].questions.map(({ key }) => key)).toEqual([
        `${kind}_first`,
      ]);
    }
    expect(normalized.staffReviewRoleId).toBe("211111111111111111");
  });

  it("keeps valid custom values while falling back safely for invalid saved values", () => {
    const normalized = normalizeTicketConfig({
      flows: {
        staff: flow("staff", {
          questions: [
            question("added", { imageUrl: "https://example.com/question.png" }),
            question("first"),
          ],
        }),
        partnership: {
          mode: "custom",
          title: " ",
          questions: [],
        },
        help_report: null,
      },
    });

    expect(normalized.flows.staff.mode).toBe("custom");
    expect(normalized.flows.staff.questions.map(({ key }) => key)).toEqual([
      "added",
      "first",
    ]);
    expect(normalized.flows.staff.questions[0]?.imageUrl).toBe(
      "https://example.com/question.png",
    );

    expect(normalized.flows.partnership).toMatchObject({
      mode: "custom",
      title: DEFAULT_TICKET_CONFIG.flows.partnership.title,
      questions: DEFAULT_TICKET_CONFIG.flows.partnership.questions,
    });
    expect(normalized.flows.help_report).toMatchObject({
      mode: DEFAULT_TICKET_CONFIG.flows.help_report.mode,
      title: DEFAULT_TICKET_CONFIG.flows.help_report.title,
      questions: DEFAULT_TICKET_CONFIG.flows.help_report.questions,
    });
  });

  it("removes duplicate keys after normalizing saved flows", () => {
    const normalized = normalizeTicketConfig({
      flows: {
        staff: flow("staff", {
          questions: [
            question("first"),
            question("FIRST"),
            question("second"),
          ],
        }),
      },
    });

    expect(normalized.flows.staff.questions.map(({ key }) => key)).toEqual([
      "first",
      "second",
    ]);
  });

  it("round-trips two independent media slots and allows each to be cleared", () => {
    const normalized = normalizeTicketConfig({
      flows: {
        staff: flow("staff", {
          panelImageUrl: "https://example.com/panel.png",
          panelThumbnailUrl: "https://example.com/panel-thumb.png",
          completionImageUrl: "",
          completionThumbnailUrl: "https://example.com/completion-thumb.png",
          questions: [question("first", {
            imageUrl: "https://example.com/question.png",
            thumbnailUrl: "https://example.com/question-thumb.png",
          })],
        }),
      },
    });

    expect(normalized.flows.staff).toMatchObject({
      panelImageUrl: "https://example.com/panel.png",
      panelThumbnailUrl: "https://example.com/panel-thumb.png",
      completionImageUrl: undefined,
      completionThumbnailUrl: "https://example.com/completion-thumb.png",
    });
    expect(normalized.flows.staff.questions[0]).toMatchObject({
      imageUrl: "https://example.com/question.png",
      thumbnailUrl: "https://example.com/question-thumb.png",
    });
    expect(ticketFlowConfigSchema.safeParse(normalized.flows.staff).success).toBe(true);

    const unsafe = flow("staff", {
      panelThumbnailUrl: "http://insecure.example.com/thumb.png",
    });
    expect(ticketFlowConfigSchema.safeParse(unsafe).success).toBe(false);
    expect(normalizeTicketConfig({ flows: { staff: unsafe } }).flows.staff.panelThumbnailUrl)
      .toBeUndefined();
  });

  it("migrates legacy partnership thumbnail mode without losing its image", () => {
    const legacy = normalizeTicketConfig({
      allianceAnnouncementImageUrl: "https://example.com/legacy.png",
      allianceAnnouncementImageMode: "thumbnail",
    });
    expect(legacy.allianceAnnouncementImageUrl).toBeUndefined();
    expect(legacy.allianceAnnouncementThumbnailUrl).toBe("https://example.com/legacy.png");
    expect(legacy.allianceAnnouncementImageMode).toBe("thumbnail");

    const modern = normalizeTicketConfig({
      allianceAnnouncementImageUrl: "https://example.com/large.png",
      allianceAnnouncementThumbnailUrl: "https://example.com/thumb.png",
      allianceAnnouncementImageMode: "thumbnail",
    });
    expect(modern.allianceAnnouncementImageUrl).toBe("https://example.com/large.png");
    expect(modern.allianceAnnouncementThumbnailUrl).toBe("https://example.com/thumb.png");
  });

  it("rejects malformed flow payloads before they can be saved by the panel", () => {
    for (const kind of KINDS) {
      expect(ticketFlowConfigSchema.safeParse(flow(kind)).success).toBe(true);
      expect(
        ticketFlowConfigSchema.safeParse(
          flow(kind, {
            mode: "classic" as never,
            questions: [],
          }),
        ).success,
      ).toBe(false);
    }

    expect(
      ticketFlowConfigSchema.safeParse(
        flow("staff", {
          questions: [question("bad", { label: "" })],
        }),
      ).success,
    ).toBe(false);

    const duplicateResult = ticketFlowConfigSchema.safeParse(
      flow("staff", {
        questions: [question("same"), question("same")],
      }),
    );
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.error.issues).toContainEqual(expect.objectContaining({
        path: ["questions", 1, "key"],
        message: 'Cheia "same" este duplicată în acest flux.',
      }));
    }
  });
});
