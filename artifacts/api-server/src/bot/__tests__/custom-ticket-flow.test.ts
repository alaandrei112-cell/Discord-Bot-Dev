import { beforeEach, describe, expect, it, vi } from "vitest";
import { Collection, type ButtonInteraction, type ModalSubmitInteraction } from "discord.js";
import {
  DEFAULT_TICKET_CONFIG,
  setTicketConfig,
  type TicketCategoryKind,
  type TicketFlowConfig,
  type TicketQuestionConfig,
} from "../ticket-config";
import {
  handleTicketButton,
  handleTicketQuestionModal,
  scheduleIncompleteTicketDeletion,
  ticketPanelPayload,
  ticketQuestionModal,
} from "../ticket-ui";

type StoredProgress = {
  currentStep: number;
  panelMessageId: string;
  applicantUsername?: string;
  responseMessageId?: string;
  answers?: Record<string, string>;
  status?: "completed" | "rejected";
};

const persistence = vi.hoisted(() => ({
  records: new Map<string, StoredProgress>(),
}));

vi.mock("../db", () => {
  const key = (channelId: string, applicantId: string) => `${channelId}:${applicantId}`;
  const clone = (value: StoredProgress | undefined): StoredProgress | null =>
    value ? structuredClone(value) : null;

  return {
    claimTicketAlliancePublication: vi.fn(),
    finishTicketAlliancePublication: vi.fn(),
    loadAllianceRecruitmentText: vi.fn(async () => null),
    loadTicketProgress: vi.fn(async (channelId: string, applicantId: string) =>
      clone(persistence.records.get(key(channelId, applicantId))),
    ),
    loadTicketProgressForChannel: vi.fn(async (channelId: string) =>
      [...persistence.records.entries()]
        .filter(([recordKey]) => recordKey.startsWith(`${channelId}:`))
        .map(([recordKey, progress]) => ({
          applicantId: recordKey.slice(channelId.length + 1),
          progress: structuredClone(progress),
        })),
    ),
    rejectTicketAlliance: vi.fn(),
    releaseTicketAlliancePublication: vi.fn(),
    saveTicketProgress: vi.fn(async (
      channelId: string,
      applicantId: string,
      progress: StoredProgress,
    ) => {
      persistence.records.set(key(channelId, applicantId), structuredClone(progress));
    }),
  };
});

const GUILD_ID = "211111111111111111";
const STAFF_ROLE_ID = "222222222222222222";
const USER_ID = "333333333333333333";

function questionConfig(key: string, overrides: Partial<TicketQuestionConfig> = {}): TicketQuestionConfig {
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

function customFlow(
  kind: TicketCategoryKind,
  completionAction: TicketFlowConfig["completionAction"],
  questions = [questionConfig(`${kind}_question`)],
  postedQuestionKeys?: string[],
): TicketFlowConfig {
  return {
    mode: "custom",
    title: `Flux personalizat ${kind}`,
    startButtonLabel: `Începe ${kind}`,
    panelDescription: `Panou configurat pentru ${kind}`,
    requirementsText: `Cerințe configurate pentru ${kind}`,
    completionMessage: `Mesaj final configurat pentru ${kind}`,
    staffNotificationMessage: `Notificare staff configurată pentru ${kind}`,
    completionAction,
    questions,
    ...(postedQuestionKeys ? { postedQuestionKeys } : {}),
  };
}

function configureFlows(flows: Partial<Record<TicketCategoryKind, TicketFlowConfig>>) {
  setTicketConfig(GUILD_ID, {
    ...DEFAULT_TICKET_CONFIG,
    staffReviewRoleId: STAFF_ROLE_ID,
    flows: {
      ...DEFAULT_TICKET_CONFIG.flows,
      ...flows,
    },
  });
}

function panelMessage(kind: TicketCategoryKind) {
  return {
    id: "panel-1",
    components: [{ components: [{ customId: `ticket_start_${kind}` }] }],
    edit: vi.fn(async () => undefined),
  };
}

function makeStartInteraction(kind: TicketCategoryKind) {
  const showModal = vi.fn(async (_modal: { toJSON(): unknown }) => undefined);
  const interaction = {
    customId: `ticket_start_${kind}`,
    channelId: `custom-${kind}-channel`,
    guildId: GUILD_ID,
    user: {
      id: USER_ID,
      username: "Applicant",
      globalName: "Applicant",
    },
    message: panelMessage(kind),
    showModal,
  };
  return {
    interaction: interaction as unknown as ButtonInteraction,
    showModal,
  };
}

function makeAnswerInteraction(
  kind: TicketCategoryKind,
  key: string,
  value: string,
  channelId: string,
) {
  const sentPayloads: unknown[] = [];
  const panel = panelMessage(kind);
  const editReply = vi.fn(async (_payload: unknown) => undefined);
  const responseMessage = { id: `response-${key}` };
  const channel = {
    isTextBased: () => true,
    send: vi.fn(async (payload: unknown) => {
      sentPayloads.push(payload);
      return responseMessage;
    }),
    messages: {
      fetch: vi.fn(async () => panel),
    },
  };
  const interaction = {
    customId: `ticket_answer_${kind}_${key}`,
    channelId,
    guildId: GUILD_ID,
    user: {
      id: USER_ID,
      username: "Applicant",
      globalName: "Applicant",
      displayAvatarURL: () => "https://example.com/avatar.png",
    },
    fields: {
      getTextInputValue: vi.fn(() => value),
    },
    channel,
    deferReply: vi.fn(async () => undefined),
    editReply,
    deleteReply: vi.fn(async () => undefined),
  };
  return {
    interaction: interaction as unknown as ModalSubmitInteraction,
    channel,
    panel,
    editReply,
    sentPayloads,
  };
}

function embedJson(payload: unknown) {
  const candidate = payload as {
    embeds?: { toJSON(): { fields?: { name?: string }[] } }[];
  };
  return candidate.embeds?.[0]?.toJSON() ?? {};
}

describe("custom ticket flows in Discord", () => {
  beforeEach(() => {
    persistence.records.clear();
    vi.clearAllMocks();
  });

  it("starts a new custom flow with the configured first question instead of the legacy form", async () => {
    const questions = [
      questionConfig("added_first"),
      questionConfig("reordered_second"),
    ];
    configureFlows({ staff: customFlow("staff", "keep_open", questions) });

    const panel = ticketPanelPayload("staff", undefined, GUILD_ID);
    const panelEmbed = panel.embeds[0]!.toJSON();
    expect(panelEmbed.title).toBe("Flux personalizat staff");
    expect(panelEmbed.description).toBe("Panou configurat pentru staff");
    expect(panelEmbed.fields?.[0]?.value).toContain("2 întrebări");

    const started = makeStartInteraction("staff");
    expect(await handleTicketButton(started.interaction)).toBe(true);
    const modal = started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string };
    expect(modal.custom_id).toBe("ticket_answer_staff_added_first");
    expect(persistence.records.get("custom-staff-channel:333333333333333333")).toMatchObject({
      currentStep: 0,
      panelMessageId: "panel-1",
    });

    expect(ticketQuestionModal("staff", "reordered_second", GUILD_ID)?.toJSON().custom_id).toBe(
      "ticket_answer_staff_reordered_second",
    );
  });

  it.each(["staff", "partnership", "help_report"] as const)(
    "opens the custom first question for the %s ticket type",
    async (kind) => {
      configureFlows({
        [kind]: customFlow(kind, "keep_open", [questionConfig(`${kind}_custom_first`)]),
      });
      const started = makeStartInteraction(kind);

      expect(await handleTicketButton(started.interaction)).toBe(true);
      expect(
        (started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string }).custom_id,
      ).toBe(`ticket_answer_${kind}_${kind}_custom_first`);
    },
  );

  it("keeps added, deleted, and reordered questions in the configured progression", async () => {
    const questions = [
      questionConfig("added"),
      questionConfig("original_first"),
      questionConfig("original_third"),
    ];
    configureFlows({ help_report: customFlow("help_report", "keep_open", questions) });
    const channelId = "custom-progress-channel";
    const started = makeStartInteraction("help_report");
    (started.interaction as unknown as { channelId: string }).channelId = channelId;

    await handleTicketButton(started.interaction);
    expect(
      (started.showModal.mock.calls[0]?.[0].toJSON() as { custom_id: string }).custom_id,
    ).toBe("ticket_answer_help_report_added");

    const first = makeAnswerInteraction("help_report", "added", "Răspuns nou", channelId);
    await handleTicketQuestionModal(first.interaction);
    expect(persistence.records.get(`${channelId}:${USER_ID}`)).toMatchObject({
      currentStep: 1,
      answers: { added: "Răspuns nou" },
    });
    const firstReply = first.sentPayloads[0] as {
      components?: { toJSON(): { components: { custom_id?: string }[] } }[];
    };
    expect(firstReply.components?.[0]?.toJSON().components[0]?.custom_id).toBe(
      "ticket_next_help_report_2",
    );

    const second = makeAnswerInteraction("help_report", "original_first", "Răspuns vechi", channelId);
    const oldAnswer = {
      id: "response-added",
      components: [{ components: [{ customId: "ticket_next_help_report_2" }] }],
      edit: vi.fn(),
    };
    second.channel.messages.fetch.mockResolvedValueOnce(oldAnswer as never);
    await handleTicketQuestionModal(second.interaction);
    expect(oldAnswer.edit).toHaveBeenCalledWith({ components: [] });
    expect(persistence.records.get(`${channelId}:${USER_ID}`)).toMatchObject({
      currentStep: 2,
      answers: { added: "Răspuns nou", original_first: "Răspuns vechi" },
    });

    const third = makeAnswerInteraction("help_report", "original_third", "Ultimul răspuns", channelId);
    await handleTicketQuestionModal(third.interaction);
    const completed = persistence.records.get(`${channelId}:${USER_ID}`);
    expect(completed).toMatchObject({
      currentStep: 3,
      status: "completed",
      answers: {
        added: "Răspuns nou",
        original_first: "Răspuns vechi",
        original_third: "Ultimul răspuns",
      },
    });
    expect(embedJson(third.sentPayloads[0]).fields?.map((field: { name?: string }) => field.name)).toEqual([
      "Întrebarea added",
      "Întrebarea original_first",
      "Întrebarea original_third",
    ]);
    expect(completed?.answers).not.toHaveProperty("deleted_question");
  });

  it("posts every configured question in the private summary even when public keys are restricted", async () => {
    const questions = [
      questionConfig("visible_first"),
      questionConfig("hidden_middle"),
      questionConfig("visible_last"),
    ];
    configureFlows({
      help_report: customFlow("help_report", "keep_open", questions, ["visible_first", "visible_last"]),
    });
    const channelId = "custom-selected-summary-channel";
    const started = makeStartInteraction("help_report");
    (started.interaction as unknown as { channelId: string }).channelId = channelId;

    await handleTicketButton(started.interaction);
    let completionPayloads: unknown[] = [];
    for (const [key, value] of [
      ["visible_first", "Primul răspuns"],
      ["hidden_middle", "Răspunsul ascuns"],
      ["visible_last", "Ultimul răspuns"],
    ] as const) {
      const answer = makeAnswerInteraction("help_report", key, value, channelId);
      await handleTicketQuestionModal(answer.interaction);
      completionPayloads = answer.sentPayloads;
    }

    const completed = persistence.records.get(`${channelId}:${USER_ID}`);
    expect(completed?.status).toBe("completed");
    expect(embedJson(completionPayloads[0]).fields?.map((field: { name?: string }) => field.name)).toEqual([
      "Întrebarea visible_first",
      "Întrebarea hidden_middle",
      "Întrebarea visible_last",
    ]);
  });

  it.each([
    ["staff", "lock"],
    ["partnership", "notify_staff"],
    ["help_report", "keep_open"],
  ] as const)(
    "applies the configured %s completion action (%s), messages, and staff role",
    async (kind, completionAction) => {
      configureFlows({
        [kind]: customFlow(kind, completionAction, [questionConfig(`${kind}_only`)]),
      });
      const channelId = `action-${kind}-channel`;
      persistence.records.set(`${channelId}:${USER_ID}`, {
        currentStep: 0,
        panelMessageId: "panel-1",
        applicantUsername: "Applicant",
      });

      const answer = makeAnswerInteraction(kind, `${kind}_only`, "Răspuns final", channelId);
      expect(await handleTicketQuestionModal(answer.interaction)).toBe(true);

      const sent = answer.sentPayloads[0] as {
        content?: string;
        allowedMentions?: { roles?: string[] };
      };
      expect((answer.interaction as unknown as { deleteReply: ReturnType<typeof vi.fn> }).deleteReply).toHaveBeenCalled();
      expect(answer.editReply).not.toHaveBeenCalled();

      if (completionAction === "notify_staff") {
        expect(sent.content).toBe(
          `<@&${STAFF_ROLE_ID}>\nNotificare staff configurată pentru ${kind}`,
        );
        expect(sent.allowedMentions?.roles).toEqual([STAFF_ROLE_ID]);
      } else {
        expect(sent.content).toBeUndefined();
        expect(sent.allowedMentions?.roles).toBeUndefined();
      }

      expect(answer.channel.messages.fetch).toHaveBeenCalledWith("panel-1");
      expect(answer.panel.edit).toHaveBeenCalled();
    },
  );

  it("rejects another user's, stale, missing and completed continuation buttons", async () => {
    configureFlows({ help_report: customFlow("help_report", "keep_open", [
      questionConfig("one"), questionConfig("two"),
    ]) });
    const channelId = "guarded-flow";
    persistence.records.set(`${channelId}:${USER_ID}`, {
      currentStep: 1, panelMessageId: "panel-1", responseMessageId: "response-one",
    });
    const showModal = vi.fn();
    const reply = vi.fn();
    const button = (userId: string, messageId: string, customId = "ticket_next_help_report_2", hasButton = true) => ({
      customId, channelId, guildId: GUILD_ID, user: { id: userId },
      message: { id: messageId, components: hasButton ? [{ components: [{ customId }] }] : [] },
      showModal, reply,
    }) as unknown as ButtonInteraction;
    await handleTicketButton(button("another-user", "response-one"));
    await handleTicketButton(button(USER_ID, "old-response"));
    await handleTicketButton(button(USER_ID, "response-one", "ticket_next_help_report_2", false));
    await handleTicketButton(button(USER_ID, "response-one", "ticket_next_help_report_1"));
    expect(showModal).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(4);
    await handleTicketButton(button(USER_ID, "response-one"));
    expect(showModal).toHaveBeenCalledTimes(1);
    persistence.records.get(`${channelId}:${USER_ID}`)!.status = "completed";
    await handleTicketButton(button(USER_ID, "response-one"));
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it("attaches legacy continuation to its channel answer, not a private reply", async () => {
    setTicketConfig(GUILD_ID, DEFAULT_TICKET_CONFIG);
    const channelId = "legacy-help-channel";
    persistence.records.set(`${channelId}:${USER_ID}`, {
      currentStep: 0, panelMessageId: "panel-1",
    });
    const answer = makeAnswerInteraction("help_report", "type", "ajutor", channelId);
    await handleTicketQuestionModal(answer.interaction);
    const sent = answer.sentPayloads[0] as {
      components: { toJSON(): { components: { custom_id: string }[] } }[];
    };
    expect(sent.components[0]?.toJSON().components[0]?.custom_id).toBe("ticket_next_help_report_2");
    expect(persistence.records.get(`${channelId}:${USER_ID}`)?.responseMessageId).toBe("response-type");
    expect(answer.editReply).not.toHaveBeenCalled();
    expect((answer.interaction as unknown as { deleteReply: ReturnType<typeof vi.fn> }).deleteReply).toHaveBeenCalled();
  });

  it("keeps custom partnership answers intact and chunks long private summaries", async () => {
    const questions = Array.from({ length: 12 }, (_, i) => questionConfig(`answer_${i}`, { multiline: true }));
    configureFlows({ partnership: customFlow("partnership", "keep_open", questions, ["answer_0"]) });
    const channelId = "long-partnership";
    persistence.records.set(`${channelId}:${USER_ID}`, {
      currentStep: 11, panelMessageId: "panel-1",
      answers: Object.fromEntries(questions.slice(0, -1).map((q) => [q.key, "X".repeat(900)])),
    });
    const last = makeAnswerInteraction("partnership", "answer_11", "Y".repeat(900), channelId);
    const oldAnswer = {
      id: "old-partnership-answer",
      components: [{ components: [{ customId: "ticket_next_partnership_12" }] }],
      edit: vi.fn(),
    };
    persistence.records.get(`${channelId}:${USER_ID}`)!.responseMessageId = oldAnswer.id;
    last.channel.messages.fetch.mockResolvedValueOnce(oldAnswer as never);
    await handleTicketQuestionModal(last.interaction);
    expect(oldAnswer.edit).toHaveBeenCalledWith({ components: [] });
    const state = persistence.records.get(`${channelId}:${USER_ID}`)!;
    expect(state.status).toBe("completed");
    expect(state.answers?.answer_11).toBe("Y".repeat(900));
    expect(last.sentPayloads.length).toBeGreaterThan(1);
    const names = last.sentPayloads.flatMap((payload) =>
      (payload as { embeds: { toJSON(): { fields?: { name: string }[] } }[] }).embeds.flatMap(
        (embed) => embed.toJSON().fields?.map((field) => field.name) ?? [],
      ),
    );
    for (const question of questions) expect(names).toContain(question.label);
    expect(last.sentPayloads.slice(0, -1).every((payload) =>
      !(payload as { components?: unknown[] }).components?.length,
    )).toBe(true);
    expect((last.sentPayloads.at(-1) as { components: unknown[] }).components).toHaveLength(1);
  });

  it("does not warn or delete a completed keep-open ticket after scheduling from persisted progress", async () => {
    vi.useFakeTimers();
    try {
      configureFlows({ help_report: customFlow("help_report", "keep_open") });
      persistence.records.set(`persisted-channel:${USER_ID}`, {
        currentStep: 1, panelMessageId: "panel-1", status: "completed",
      });
      const send = vi.fn();
      const remove = vi.fn();
      scheduleIncompleteTicketDeletion({
        id: "persisted-channel", guildId: GUILD_ID,
        createdTimestamp: Date.now() - 19 * 60_000,
        delete: remove, send,
        client: { user: { id: "bot-user" } },
        permissionOverwrites: { cache: new Collection([
          ["bot-user", { id: "bot-user", type: 1, allow: { has: () => true } }],
          [USER_ID, { id: USER_ID, type: 1, allow: { has: () => true } }],
        ]) },
        messages: { fetch: vi.fn(async () => new Map()) },
      });
      await vi.advanceTimersByTimeAsync(45 * 60_000);
      expect(send).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mentions the persisted applicant, not the bot appearing first in Discord overwrites", async () => {
    vi.useFakeTimers();
    try {
      configureFlows({ help_report: customFlow("help_report", "keep_open") });
      persistence.records.set(`unfinished-collection:${USER_ID}`, {
        currentStep: 1, panelMessageId: "panel-1",
      });
      const send = vi.fn().mockResolvedValue(undefined);
      scheduleIncompleteTicketDeletion({
        id: "unfinished-collection", guildId: GUILD_ID,
        createdTimestamp: Date.now() - 19 * 60_000,
        delete: vi.fn(), send,
        client: { user: { id: "bot-user" } },
        permissionOverwrites: { cache: new Collection([
          ["bot-user", { id: "bot-user", type: 1, allow: { has: () => true } }],
          [USER_ID, { id: USER_ID, type: 1, allow: { has: () => true } }],
        ]) },
        messages: { fetch: vi.fn(async () => new Map()) },
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        allowedMentions: { parse: [], users: [USER_ID] },
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps every character of a stored long answer across private summary fields", async () => {
    configureFlows({ staff: customFlow("staff", "keep_open", [
      questionConfig("long"), questionConfig("last"),
    ]) });
    const channelId = "long-answer-channel";
    const longAnswer = "X".repeat(2400);
    persistence.records.set(`${channelId}:${USER_ID}`, {
      currentStep: 1, panelMessageId: "panel-1", answers: { long: longAnswer },
    });
    const answer = makeAnswerInteraction("staff", "last", "final", channelId);
    await handleTicketQuestionModal(answer.interaction);
    const parts = answer.sentPayloads.flatMap((payload) =>
      (payload as { embeds: { toJSON(): { fields?: { name: string; value: string }[] } }[] }).embeds.flatMap(
        (embed) => embed.toJSON().fields ?? [],
      ),
    ).filter((field) => field.name.startsWith("Întrebarea long"));
    expect(parts.map((field) => field.value).join("")).toBe(longAnswer);
    expect(parts.every((field) => field.value.length <= 1024)).toBe(true);
  });

  it("does not report an error when dismissing an already saved modal fails", async () => {
    configureFlows({ help_report: customFlow("help_report", "keep_open", [questionConfig("only")]) });
    const channelId = "delete-reply-failure";
    persistence.records.set(`${channelId}:${USER_ID}`, { currentStep: 0, panelMessageId: "panel-1" });
    const answer = makeAnswerInteraction("help_report", "only", "saved", channelId);
    (answer.interaction as unknown as { deleteReply: ReturnType<typeof vi.fn> }).deleteReply
      .mockRejectedValueOnce(new Error("Expired interaction token"));
    await handleTicketQuestionModal(answer.interaction);
    expect(persistence.records.get(`${channelId}:${USER_ID}`)?.status).toBe("completed");
    expect(answer.editReply).not.toHaveBeenCalled();
  });
});