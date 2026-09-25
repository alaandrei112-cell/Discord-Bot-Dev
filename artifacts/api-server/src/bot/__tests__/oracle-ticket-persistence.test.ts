import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ButtonInteraction } from "discord.js";

type StoredProgress = {
  currentStep: number;
  panelMessageId: string;
  applicantUsername?: string;
  responseMessageId?: string;
  answers?: Record<string, string>;
  alliancePosted?: boolean;
  alliancePublishing?: boolean;
  alliancePublishClaimedAt?: number;
  alliancePublicMessageId?: string;
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
    loadAllianceRecruitmentText: vi.fn(async () => null),
    loadTicketProgress: vi.fn(async (channelId: string, applicantId: string) =>
      clone(persistence.records.get(key(channelId, applicantId)))),
    saveTicketProgress: vi.fn(async (
      channelId: string,
      applicantId: string,
      progress: StoredProgress,
    ) => {
      persistence.records.set(key(channelId, applicantId), structuredClone(progress));
    }),
    rejectTicketAlliance: vi.fn(async (
      channelId: string,
      applicantId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (
        !current ||
        current.status !== "completed" ||
        current.alliancePosted ||
        current.alliancePublishing
      ) {
        return null;
      }
      const rejected = { ...current, status: "rejected" as const, alliancePublishing: false };
      persistence.records.set(recordKey, rejected);
      return clone(rejected);
    }),
    claimTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (
        !current ||
        current.status !== "completed" ||
        current.alliancePosted ||
        current.alliancePublishing
      ) {
        return null;
      }
      const claimed = {
        ...current,
        alliancePublishing: true,
        alliancePublishClaimedAt: Date.now(),
      };
      persistence.records.set(recordKey, claimed);
      return clone(claimed);
    }),
    finishTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
      publicMessageId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (!current?.alliancePublishing) return null;
      const finished = {
        ...current,
        alliancePosted: true,
        alliancePublishing: false,
        alliancePublicMessageId: publicMessageId,
      };
      persistence.records.set(recordKey, finished);
      return clone(finished);
    }),
    releaseTicketAlliancePublication: vi.fn(async (
      channelId: string,
      applicantId: string,
    ) => {
      const recordKey = key(channelId, applicantId);
      const current = persistence.records.get(recordKey);
      if (!current?.alliancePublishing) return null;
      const released = { ...current, alliancePublishing: false };
      persistence.records.set(recordKey, released);
      return clone(released);
    }),
  };
});

const STAFF_REVIEW_ROLE_ID = "1472526137308745909";
const ALLIANCE_PUBLIC_CHANNEL_ID = "1472997077373157602";

const completedDraft = (): StoredProgress => ({
  currentStep: 8,
  panelMessageId: "panel-1",
  responseMessageId: "response-1",
  applicantUsername: "Andrei",
  answers: {
    server_name: "Regatul Umbrelor",
    representative: "Andrei",
    invite: "https://discord.gg/umbrelor",
    members: "150 total · 60 activi",
    description: "Comunitate RPG medievală.",
    motivation: "Dorim o alianță.",
    offer: "Promovare reciprocă.",
    terms: "Acceptăm regulile.",
  },
  status: "completed",
});

function makeInteraction(
  customId: string,
  channelId: string,
  publicSend = vi.fn(async () => ({ id: "public-message-1" })),
  guildId = "1382035307607883816",
  messageId = "response-1",
  publicChannelGuildId = guildId,
) {
  const reply = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const update = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const followUp = vi.fn(async (_payload: unknown): Promise<void> => undefined);
  const showModal = vi.fn(async (_modal: { toJSON(): unknown }): Promise<void> => undefined);
  const interaction = {
    customId,
    channelId,
    guildId,
    message: {
      id: messageId,
      components: [{
        components: [{
          customId,
        }],
      }],
    },
    member: { roles: [STAFF_REVIEW_ROLE_ID] },
    memberPermissions: { has: vi.fn(() => true) },
    client: (() => {
      const fetch = vi.fn(async () => ({
        guildId: publicChannelGuildId,
        isTextBased: () => true,
        send: publicSend,
      }));
      return { channels: { fetch }, fetchPublicChannel: fetch };
    })(),
    reply,
    update,
    followUp,
    showModal,
  };
  return {
    interaction: interaction as unknown as ButtonInteraction,
    publicSend,
    reply,
    update,
    followUp,
    showModal,
    fetchPublicChannel: interaction.client.fetchPublicChannel,
  };
}

async function freshTicketUi() {
  vi.resetModules();
  return import("../ticket-ui");
}

describe("persistent alliance publication flow", () => {
  beforeEach(() => {
    persistence.records.clear();
    vi.clearAllMocks();
  });

  it("reloads a completed draft after restart for confirm, edit, and publish actions", async () => {
    persistence.records.set("restart-ticket:101", completedDraft());
    const { handleTicketButton } = await freshTicketUi();

    const confirm = makeInteraction("ticket_alliance_confirm_101", "restart-ticket");
    expect(await handleTicketButton(confirm.interaction)).toBe(true);
    expect(confirm.update).toHaveBeenCalledOnce();
    const confirmPayload = confirm.update.mock.calls[0]![0] as {
      components: { toJSON(): { components: { custom_id?: string }[] } }[];
    };
    expect(confirmPayload.components[0]!.toJSON().components.map((button) => button.custom_id)).toEqual([
      "ticket_alliance_post_101",
      "ticket_alliance_edit_101",
    ]);

    const edit = makeInteraction("ticket_alliance_edit_101", "restart-ticket");
    expect(await handleTicketButton(edit.interaction)).toBe(true);
    expect(edit.showModal).toHaveBeenCalledOnce();
    const editModal = edit.showModal.mock.calls[0]![0].toJSON() as { custom_id: string };
    expect(editModal.custom_id).toBe("ticket_form_alliance_edit_submit_101");

    const publish = makeInteraction("ticket_alliance_post_101", "restart-ticket");
    expect(await handleTicketButton(publish.interaction)).toBe(true);
    expect(publish.fetchPublicChannel).toHaveBeenCalledWith(ALLIANCE_PUBLIC_CHANNEL_ID);
    expect(publish.publicSend).toHaveBeenCalledOnce();
    expect(publish.update).toHaveBeenCalledOnce();
    expect(persistence.records.get("restart-ticket:101")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "public-message-1",
    });
  });

  it("lets alliance staff refuse a completed pact and prevents publication", async () => {
    persistence.records.set("reject-ticket:404", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const rejection = makeInteraction("ticket_alliance_reject_404", "reject-ticket");

    expect(await handleTicketButton(rejection.interaction)).toBe(true);
    expect(rejection.update).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("<@404>"),
      components: [],
      allowedMentions: { parse: [], users: ["404"] },
    }));
    expect(rejection.publicSend).not.toHaveBeenCalled();
    expect(persistence.records.get("reject-ticket:404")).toMatchObject({
      status: "rejected",
      alliancePublishing: false,
    });
    expect(persistence.records.get("reject-ticket:404")?.alliancePosted).not.toBe(true);
  });

  it("allows only one announcement for concurrent publish clicks", async () => {
    persistence.records.set("race-ticket:202", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const publicSend = vi.fn(async () => ({ id: "public-race-message" }));
    const first = makeInteraction("ticket_alliance_post_202", "race-ticket", publicSend);
    const second = makeInteraction("ticket_alliance_post_202", "race-ticket", publicSend);

    await Promise.all([
      handleTicketButton(first.interaction),
      handleTicketButton(second.interaction),
    ]);

    expect(publicSend).toHaveBeenCalledOnce();
    expect(first.update.mock.calls.length + second.update.mock.calls.length).toBe(1);
    const duplicateReply = [...first.reply.mock.calls, ...second.reply.mock.calls]
      .map(([payload]) => (payload as { content?: string }).content)
      .find((content) => content?.includes("deja") || content?.includes("în curs"));
    expect(duplicateReply).toBeDefined();
    expect(persistence.records.get("race-ticket:202")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "public-race-message",
    });
  });

  it("does not republish an already published draft", async () => {
    persistence.records.set("published-ticket:303", {
      ...completedDraft(),
      alliancePosted: true,
      alliancePublishing: false,
      alliancePublicMessageId: "existing-message",
    });
    const { handleTicketButton } = await freshTicketUi();
    const attempt = makeInteraction("ticket_alliance_post_303", "published-ticket");

    expect(await handleTicketButton(attempt.interaction)).toBe(true);
    expect(attempt.publicSend).not.toHaveBeenCalled();
    expect(attempt.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: "✅ Alianța a fost deja publicată.",
    }));
  });

  it("reports a publication already in progress without sending again", async () => {
    persistence.records.set("publishing-ticket:404", {
      ...completedDraft(),
      alliancePublishing: true,
      alliancePublishClaimedAt: Date.now(),
    });
    const { handleTicketButton } = await freshTicketUi();
    const attempt = makeInteraction("ticket_alliance_post_404", "publishing-ticket");

    expect(await handleTicketButton(attempt.interaction)).toBe(true);
    expect(attempt.publicSend).not.toHaveBeenCalled();
    expect(attempt.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("deja în curs"),
    }));
  });

  it("releases a failed send so the draft can be retried", async () => {
    persistence.records.set("failure-ticket:505", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const failedSend = vi.fn(async () => {
      throw new Error("Discord send failed");
    });
    const failed = makeInteraction("ticket_alliance_post_505", "failure-ticket", failedSend);

    expect(await handleTicketButton(failed.interaction)).toBe(true);
    expect(failedSend).toHaveBeenCalledOnce();
    expect(failed.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("nu a putut fi publicat"),
    }));
    const released = persistence.records.get("failure-ticket:505");
    expect(released?.alliancePosted).not.toBe(true);
    expect(released?.alliancePublishing).toBe(false);

    const retry = makeInteraction("ticket_alliance_post_505", "failure-ticket");
    expect(await handleTicketButton(retry.interaction)).toBe(true);
    expect(retry.publicSend).toHaveBeenCalledOnce();
    expect(persistence.records.get("failure-ticket:505")).toMatchObject({
      alliancePosted: true,
      alliancePublishing: false,
    });
  });

  it("rejects an alliance action from a stale or unrelated message", async () => {
    persistence.records.set("context-ticket:606", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const publicSend = vi.fn(async () => ({ id: "should-not-send" }));
    const stale = makeInteraction(
      "ticket_alliance_post_606",
      "context-ticket",
      publicSend,
      "1382035307607883816",
      "different-message",
    );

    expect(await handleTicketButton(stale.interaction)).toBe(true);
    expect(publicSend).not.toHaveBeenCalled();
    expect(stale.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("nu mai aparține"),
    }));
  });

  it("does not route an alliance announcement from an unsupported guild", async () => {
    persistence.records.set("unconfigured-ticket:707", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const publicSend = vi.fn(async () => ({ id: "should-not-send" }));
    const unconfigured = makeInteraction(
      "ticket_alliance_post_707",
      "unconfigured-ticket",
      publicSend,
      "guild-without-ticket-config",
    );

    expect(await handleTicketButton(unconfigured.interaction)).toBe(true);
    expect(publicSend).not.toHaveBeenCalled();
    expect(unconfigured.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("nu este configurat"),
    }));
    expect(persistence.records.get("unconfigured-ticket:707")?.alliancePublishing).not.toBe(true);
    expect(persistence.records.get("unconfigured-ticket:707")?.alliancePosted).not.toBe(true);
  });

  it("rejects the historical alliance channel when Discord resolves it in another guild", async () => {
    persistence.records.set("wrong-channel-guild:808", completedDraft());
    const { handleTicketButton } = await freshTicketUi();
    const publicSend = vi.fn(async () => ({ id: "should-not-send" }));
    const wrongGuildChannel = makeInteraction(
      "ticket_alliance_post_808",
      "wrong-channel-guild",
      publicSend,
      "1382035307607883816",
      "response-1",
      "another-guild",
    );

    expect(await handleTicketButton(wrongGuildChannel.interaction)).toBe(true);
    expect(wrongGuildChannel.fetchPublicChannel).toHaveBeenCalledWith(
      ALLIANCE_PUBLIC_CHANNEL_ID,
    );
    expect(publicSend).not.toHaveBeenCalled();
    expect(wrongGuildChannel.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("nu este disponibil"),
    }));
    expect(persistence.records.get("wrong-channel-guild:808")?.alliancePosted).not.toBe(true);
  });

  it("uses the channel deadline when starting a delayed staff contract", async () => {
    vi.useFakeTimers();
    const channelCreatedAt = 1_700_000_000_000;
    vi.setSystemTime(channelCreatedAt + 15 * 60 * 1000);
    try {
      const { handleTicketButton } = await freshTicketUi();
      const edit = vi.fn(async (_payload: unknown): Promise<void> => undefined);
      const interaction = {
        customId: "ticket_start_staff",
        channelId: "delayed-start-ticket",
        guildId: "1382035307607883816",
        user: {
          id: "applicant-909",
          username: "Andrei",
          globalName: "Andrei",
        },
        message: {
          id: "delayed-start-panel",
          components: [{ components: [{ customId: "ticket_start_staff" }] }],
          edit,
        },
        channel: {
          createdTimestamp: channelCreatedAt,
          isTextBased: () => true,
        },
        showModal: vi.fn(async (_modal: { toJSON(): unknown }): Promise<void> => undefined),
      } as unknown as ButtonInteraction;

      expect(await handleTicketButton(interaction)).toBe(true);
      const payload = edit.mock.calls[0]?.[0] as {
        embeds: { toJSON(): { fields?: { name?: string; value?: string }[] } }[];
      };
      const timeField = payload.embeds[0]?.toJSON().fields?.find(
        (field) => field.name === "⏳ Termen și stare",
      );
      expect(timeField?.value).toContain(
        `<t:${Math.floor((channelCreatedAt + 60 * 60 * 1000) / 1000)}:F>`,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});