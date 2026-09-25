import { describe, expect, it, vi } from "vitest";
import type { Message } from "discord.js";
vi.mock("../db", async (importOriginal) => ({
  ...await importOriginal<typeof import("../db")>(),
  loadTicketProgress: vi.fn(async () => null),
  loadTicketProgressForChannel: vi.fn(async () => []),
}));
import { isTicketCategoryParentId } from "../ticket-categories";
import {
  ORACLE_TICKET_CATEGORY_IDS,
  buildTicketSystemInstruction,
  getOracleTicketKind,
} from "../oracle-chat";
import {
  staffDetailsModal,
  partnershipDetailsModal,
  partnershipEditModal,
  partnershipHasUnder200Members,
  allianceAnnouncementText,
  allianceAnnouncementEmbed,
  allianceAnnouncementImageEmbed,
  fetchAllianceInviteStats,
  allianceRecruitmentEmbed,
  isLegacyOracleTicketPromptText,
  isStaffTagRefusal,
  partnershipConfirmRow,
  partnershipPublishRow,
  partnershipDraftEmbed,
  partnershipSummaryEmbed,
  STAFF_REVIEW_ROLE_ID,
  memberHasStaffReviewRole,
  allianceRecruitmentAnnouncementText,
  allianceRecruitmentTextModal,
  allianceStaffNotificationText,
  INCOMPLETE_TICKET_TIMEOUT_MS,
  INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS,
  INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS,
  INCOMPLETE_TICKET_WARNING_AFTER_MS,
  scheduleIncompleteTicketDeletion,
  staffOracleReviewPayload,
  ticketModal,
  ticketDeadlineForChannel,
  isTicketPanelMessage,
  postTicketPanelIfMissing,
  ticketPanelPayload,
  ticketQuestionModal,
  ticketRequirementsEmbed,
  ticketStatusRow,
} from "../ticket-ui";

function messageWithParent(parentId: string | null): Pick<Message, "channel"> {
  return {
    channel: { parentId } as unknown as Message["channel"],
  };
}

describe("Oracle ticket categories", () => {
  it("recognizes the three configured open-ticket categories", () => {
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.staff))).toBe("staff");
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.partnership))).toBe("partnership");
    expect(getOracleTicketKind(messageWithParent(ORACLE_TICKET_CATEGORY_IDS.help_report))).toBe("help_report");
  });

  it("ignores channels outside the configured ticket categories", () => {
    expect(getOracleTicketKind(messageWithParent("999999999999999999"))).toBeNull();
    expect(getOracleTicketKind(messageWithParent(null))).toBeNull();
  });

  it("marks ticket category parents as protected from automated posts", () => {
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.staff)).toBe(true);
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.partnership)).toBe(true);
    expect(isTicketCategoryParentId(ORACLE_TICKET_CATEGORY_IDS.help_report)).toBe(true);
    expect(isTicketCategoryParentId("999999999999999999")).toBe(false);
    expect(isTicketCategoryParentId(null)).toBe(false);
  });

  it("gives staff applications their own safe instructions", () => {
    const instruction = buildTicketSystemInstruction("staff");
    expect(instruction).toContain("aplicație de staff");
    expect(instruction).toContain("Panoul și ferestrele interactive colectează toate răspunsurile");
    expect(instruction).not.toContain("La începutul aplicației, prezintă un mini-formular");
    expect(instruction).not.toContain("Folosește exact această ordine");
    expect(instruction).not.toContain("Care este numele tău?");
    expect(instruction).toContain("Tagul rămâne o condiție obligatorie");
    expect(instruction).toContain("aplicația este respinsă");
    expect(instruction).toContain("Nu promite acceptarea");
    expect(instruction).toContain("Nu cere parole");
  });

  it("keeps partnerships and member reports distinct", () => {
    const partnership = buildTicketSystemInstruction("partnership");
    const helpReport = buildTicketSystemInstruction("help_report");

    expect(partnership).toContain("propunere de parteneriat");
    expect(partnership).not.toContain("Cere obligatoriu, în această ordine");
    expect(partnership).toContain("nu enumera câmpurile formularului");
    expect(helpReport).toContain("raportarea unui membru");
    expect(helpReport).toContain("Păstrează raportarea confidențială");
    expect(partnership).not.toContain("🤝 Propunere de Parteneriat");
  });

  it("detects titled and untitled legacy Oracle forms", () => {
    expect(isLegacyOracleTicketPromptText([
      "🤝 Propunere de Parteneriat",
      "1) Numele serverului",
      "2) Reprezentantul",
      "3) Linkul",
      "4) Membrii",
      "5) Descrierea",
    ].join("\n"))).toBe(true);
    expect(isLegacyOracleTicketPromptText([
      "Pentru a începe, adu-mi în această ordine:",
      "1) numele serverului",
      "2) reprezentantul serverului",
      "3) linkul serverului",
      "4) numărul de membri",
      "5) descrierea",
      "6) motivul alianței",
      "7) ce oferă serverul",
      "8) acceptarea regulilor",
    ].join("\n"))).toBe(true);
    expect(isLegacyOracleTicketPromptText("Pot să îți explic pe scurt cum funcționează verificarea.")).toBe(false);
  });

  it("starts the eight-question staff contract directly from question one", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    const row = panel.components[0]!.toJSON();

    expect(embed.title).toBe("🛡️ Contract de Staff · Deschide aplicația");
    expect(embed.fields?.[0]?.value).toContain("Tag-ul serverului");
    expect(embed.fields?.find(
      (field) => field.name === "📋 Întrebările contractului",
    )).toBeUndefined();
    const contractField = embed.fields?.find((field) => field.name === "📜 Contractul");
    expect(contractField?.value).toContain("două pagini de formular");
    const startButton = row.components[0];
    const buttonData =
      startButton && "custom_id" in startButton ? startButton : undefined;
    expect(buttonData?.custom_id).toBe("ticket_start_staff");
    expect(buttonData && "label" in buttonData ? buttonData.label : undefined).toBe(
      "Deschide contractul",
    );

    const firstQuestion = ticketQuestionModal("staff", "name")?.toJSON();
    expect(firstQuestion?.custom_id).toBe("ticket_answer_staff_name");
    const finalQuestion = ticketQuestionModal("staff", "server_tag")?.toJSON();
    expect(finalQuestion?.custom_id).toBe("ticket_answer_staff_server_tag");

    const questionModal = ticketQuestionModal("staff", "conflict")?.toJSON();
    expect(questionModal?.custom_id).toBe("ticket_answer_staff_conflict");
    expect(questionModal?.components).toHaveLength(1);
    const questionModalRow = questionModal?.components[0];
    const questionInput =
      questionModalRow && "components" in questionModalRow
        ? questionModalRow.components[0]
        : undefined;
    expect(
      questionInput,
    ).toMatchObject({ custom_id: "answer" });
  });

  it("keeps the seal thumbnail on the interactive panel", () => {
    const panel = ticketPanelPayload("staff");
    const embed = panel.embeds[0]!.toJSON();
    expect(embed.thumbnail?.url).toContain("/api/assets/ticket_seal.png");
  });

  it("replaces the public start button with a disabled final status", () => {
    const completed = ticketStatusRow("staff", "completed").toJSON().components[0];
    const rejected = ticketStatusRow("staff", "rejected").toJSON().components[0];
    expect(completed && "custom_id" in completed ? completed.custom_id : undefined).toBe(
      "ticket_status_staff_completed",
    );
    expect(completed && "label" in completed ? completed.label : undefined).toBe(
      "✅ Contract închis · complet",
    );
    expect(completed && "disabled" in completed ? completed.disabled : undefined).toBe(true);
    expect(rejected && "label" in rejected ? rejected.label : undefined).toBe(
      "⛔ Contract închis · respins",
    );
  });

  it("starts partnership contracts directly from their first question", () => {
    const panel = ticketPanelPayload("partnership");
    const button = panel.components[0]!.toJSON().components[0];
    expect(button && "custom_id" in button ? button.custom_id : undefined).toBe(
      "ticket_start_partnership",
    );
    expect(ticketQuestionModal("partnership", "server_name")?.toJSON().custom_id).toBe(
      "ticket_answer_partnership_server_name",
    );
    expect(ticketQuestionModal("partnership", "description")?.toJSON().components[0]).toBeDefined();
  });

  it("creates a confirmable partnership draft with publish and edit buttons", () => {
    const summary = partnershipSummaryEmbed("Andrei", {
      server_name: "Regatul Umbrelor",
      description: "Comunitate RPG medievală.",
      invite: "https://discord.gg/umbrelor",
    }).toJSON();
    expect(summary.title).toBe("🤝 Contract de Parteneriat · Rezumat pentru staff");
    expect(summary.fields?.map((field) => field.name)).toEqual([
      "📊 Starea dosarului",
      "🏰 Numele serverului",
      "📝 Descrierea serverului",
      "🔗 Linkul serverului",
      "👤 Reprezentantul serverului",
      "👥 Membri și activitate",
      "🕯️ Motivul alianței",
      "🎁 Ce oferă serverul",
      "📜 Așteptări și reguli",
    ]);
    const confirmComponents = partnershipConfirmRow("123").toJSON().components;
    const confirmButton = confirmComponents[0];
    expect(confirmButton && "custom_id" in confirmButton ? confirmButton.custom_id : undefined).toBe(
      "ticket_alliance_confirm_123",
    );
    const rejectButton = confirmComponents[1];
    expect(rejectButton && "custom_id" in rejectButton ? rejectButton.custom_id : undefined).toBe(
      "ticket_alliance_reject_123",
    );
    expect(rejectButton && "style" in rejectButton ? rejectButton.style : undefined).toBe(4);
    const draft = partnershipDraftEmbed("Andrei", {
      server_name: "Regatul Umbrelor",
      representative: "Andrei#1234",
      description: "Comunitate RPG medievală.",
      invite: "https://discord.gg/umbrelor",
      members: "150 total · 60 activi",
      motivation: "Vrem o comunitate aliată.",
      offer: "Promovare reciprocă.",
      terms: "Respectăm regulile pactului.",
    }).toJSON();
    expect(draft.title).toBe("🤝 Contract de Parteneriat · Draft de publicare");
    expect(draft.fields?.map((field) => field.name)).toEqual([
      "📊 Starea dosarului",
      "🏰 Numele serverului",
      "📝 Descrierea serverului",
      "🔗 Linkul serverului",
      "👤 Reprezentantul serverului",
      "👥 Membri și activitate",
      "🕯️ Motivul alianței",
      "🎁 Ce oferă serverul",
      "📜 Așteptări și reguli",
      "👤 Persoana care a deschis ticketul",
      "📌 Regula promovării",
    ]);
    expect(draft.fields?.some((field) => field.value?.includes("Regatul Cenușii își deschide porțile"))).toBe(false);
    expect(draft.fields?.[1]?.value).toContain("Regatul Umbrelor");
    expect(draft.fields?.[3]?.value).toContain("https://discord.gg/umbrelor");
    expect(draft.fields?.[6]?.value).toContain("Vrem o comunitate aliată.");
    expect(draft.fields?.[9]?.value).toContain("Andrei");
    const publishButtons = partnershipPublishRow("123").toJSON().components;
    expect(publishButtons.map((button) => "custom_id" in button ? button.custom_id : undefined)).toEqual([
      "ticket_alliance_post_123",
      "ticket_alliance_edit_123",
    ]);
  });

  it("limits alliance actions to members with the alliance staff role", () => {
    expect(memberHasStaffReviewRole({ roles: [STAFF_REVIEW_ROLE_ID] })).toBe(true);
    expect(memberHasStaffReviewRole({ roles: ["another-role"] })).toBe(false);
    expect(memberHasStaffReviewRole({ roles: { cache: new Map() } })).toBe(false);
    expect(
      memberHasStaffReviewRole({
        roles: { cache: new Map([[STAFF_REVIEW_ROLE_ID, true]]) },
      }),
    ).toBe(true);
    expect(memberHasStaffReviewRole(null)).toBe(false);
  });

  it("marks only partnerships below 200 total members as no-ping promotions", () => {
    expect(partnershipHasUnder200Members("199 total · 80 activi")).toBe(true);
    expect(partnershipHasUnder200Members("200 total · 80 activi")).toBe(false);
    expect(partnershipHasUnder200Members("2.000 total · 300 activi")).toBe(false);
    expect(partnershipHasUnder200Members("nu este precizat")).toBe(false);
  });

  it("shows who completed the alliance contract in the public announcement", () => {
    const announcement = allianceAnnouncementText(
      {
        server_name: "Regatul Umbrelor",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
        members: "Membri:150 total · 60 activi",
        regat_description: "🌫️ Textul privat al Regatului Cenușii",
      },
      "Andrei",
      "987654321",
    );

    expect(announcement).toContain("🤝 PACTUL CELOR DOUĂ REGATE");
    expect(announcement).toContain("🏰 Comunitatea parteneră: Regatul Umbrelor");
    expect(announcement).toContain("👤 Contract completat de: <@987654321>");
    expect(announcement).toContain("👥 Membri: 150 total · 60 online");
    expect(announcement).not.toContain("📌 Promovare:");
    expect(announcement).not.toContain("Textul privat al Regatului Cenușii");
    expect(announcement).not.toContain("@everyone");
  });

  it("renders a custom alliance template with live invite counts", async () => {
    const fetchInvite = vi.fn(async () => ({
      approximateMemberCount: 2_345,
      approximatePresenceCount: 187,
    }));
    const stats = await fetchAllianceInviteStats(
      { fetchInvite },
      "https://discord.gg/umbrelor",
    );
    const announcement = allianceAnnouncementText(
      {
        server_name: "Regatul Umbrelor",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
        members: "150 total · 60 activi",
      },
      "Andrei",
      "987654321",
      "🎉 {server_name}\n👥 {members_total}/{members_online}\n🔗 {invite}\n{applicant_mention}",
      stats,
    );

    expect(fetchInvite).toHaveBeenCalledWith(
      "https://discord.gg/umbrelor",
      { withCounts: true },
    );
    expect(announcement).toBe(
      "🎉 Regatul Umbrelor\n👥 2345/187\n🔗 https://discord.gg/umbrelor\n<@987654321>",
    );
  });

  it("renders partnership image and thumbnail concurrently in embed and text modes", () => {
    const large = "https://cdn.example.test/alliance-large.png";
    const thumbnail = "https://cdn.example.test/alliance-thumb.png";
    const embed = allianceAnnouncementEmbed("Pact confirmat", large, "large", thumbnail).toJSON();
    expect(embed.image?.url).toBe(large);
    expect(embed.thumbnail?.url).toBe(thumbnail);

    const mediaEmbed = allianceAnnouncementImageEmbed(large, "large", thumbnail)?.toJSON();
    expect(mediaEmbed?.image?.url).toBe(large);
    expect(mediaEmbed?.thumbnail?.url).toBe(thumbnail);
  });

  it("honors the saved partnership image mode even with a separate thumbnail", () => {
    const large = "https://cdn.example.test/alliance-large.png";
    const thumbnail = "https://cdn.example.test/alliance-thumb.png";
    for (const mode of ["none", "thumbnail"] as const) {
      const embed = allianceAnnouncementEmbed("Pact confirmat", large, mode, thumbnail).toJSON();
      const media = allianceAnnouncementImageEmbed(large, mode, thumbnail)?.toJSON();
      expect(embed.image).toBeUndefined();
      expect(media?.image).toBeUndefined();
      expect(embed.thumbnail?.url).toBe(thumbnail);
      expect(media?.thumbnail?.url).toBe(thumbnail);
    }
    expect(allianceAnnouncementEmbed("Pact confirmat", large, "thumbnail").toJSON().thumbnail?.url).toBe(large);
  });

  it("builds a designed automatic recruitment advertisement from the partner answers", () => {
    const ad = allianceRecruitmentEmbed(
      {
        server_name: "Regatul Umbrelor",
        representative: "Andrei#1234",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
        members: "150 total · 60 activi",
        motivation: "Vrem o comunitate aliată.",
        offer: "Promovare reciprocă.",
        terms: "Respectăm regulile pactului.",
      },
      "Andrei",
    ).toJSON();

    expect(ad.title).toContain("Regatul Umbrelor");
    expect(ad.description).toContain("Comunitate RPG medievală.");
    expect(ad.fields?.map((field) => field.name)).toEqual([
      "👤 Reprezentantul serverului",
      "🧑‍💻 Propus de",
      "👥 Membri și activitate",
      "🔗 Link de invitație",
      "🕯️ De ce caută alianța",
      "🎁 Ce oferă comunitatea",
      "📜 Așteptări și reguli",
    ]);
    expect(ad.fields?.find((field) => field.name === "🔗 Link de invitație")?.value).toContain(
      "https://discord.gg/umbrelor",
    );
  });

  it("builds the staff notification and approved recruitment announcement", () => {
    const staffNotification = allianceStaffNotificationText("Andrei");
    const recruitmentAnnouncement = allianceRecruitmentAnnouncementText();

    expect(staffNotification).toContain(`<@&${STAFF_REVIEW_ROLE_ID}>`);
    expect(staffNotification).toContain("O nouă cerere de alianță");
    expect(recruitmentAnnouncement).toContain("🌫️ Regatul Cenușii își deschide porțile");
    expect(recruitmentAnnouncement).toContain("Tag: || @here || || @everyone ||");
    expect(recruitmentAnnouncement).toContain(
      "https://discord.gg/regatulcenusii",
    );
    expect(recruitmentAnnouncement).toContain("standard.gif");
  });

  it("supports an administrator-owned custom alliance announcement", () => {
    const customText = "🌫️ Mesaj personalizat pentru alianță\n🔗 https://discord.gg/exemplu";
    const modal = allianceRecruitmentTextModal(customText).toJSON();
    const firstRow = modal.components?.[0];
    const input = firstRow && "components" in firstRow ? firstRow.components[0] : undefined;

    expect(modal.custom_id).toBe("alliance_recruitment_text_modal");
    expect(modal.title).toBe("Editează textul alianței");
    expect(input).toMatchObject({
      custom_id: "alliance_recruitment_text",
      value: customText,
    });
    expect(allianceRecruitmentAnnouncementText(customText)).toBe(customText);
    expect(allianceRecruitmentAnnouncementText("")).toContain(
      "🌫️ Regatul Cenușii își deschide porțile",
    );
  });

  it("warns after 20 and 50 minutes and deletes an unfinished ticket after 60 minutes", async () => {
    vi.useFakeTimers();
    try {
      const deleteChannel = vi.fn().mockResolvedValue(undefined);
      const fetchMessages = vi.fn().mockResolvedValue(new Map());
      const send = vi.fn().mockResolvedValue(undefined);
      const createdTimestamp = Date.now() - 15 * 60 * 1000;
      scheduleIncompleteTicketDeletion({
        id: "unfinished-ticket",
        createdTimestamp,
        delete: deleteChannel,
        send,
        permissionOverwrites: {
          cache: [{
            id: "applicant-123",
            type: 1,
            allow: { has: vi.fn().mockReturnValue(true) },
          }],
        },
        messages: { fetch: fetchMessages },
      });

      await vi.advanceTimersByTimeAsync(INCOMPLETE_TICKET_WARNING_AFTER_MS);

      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining("<@applicant-123>"),
        allowedMentions: { parse: [], users: ["applicant-123"] },
      }));
      expect(send.mock.calls[0]?.[0]?.content).toContain(
        `<t:${Math.floor((createdTimestamp + INCOMPLETE_TICKET_TIMEOUT_MS) / 1000)}:R>`,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(deleteChannel).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(
        INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS - INCOMPLETE_TICKET_FIRST_WARNING_AFTER_MS,
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]?.content).toContain("<@applicant-123>");
      expect(send.mock.calls[1]?.[0]?.content).toContain("Au trecut 50 de minute");
      expect(send.mock.calls[1]?.[0]?.allowedMentions).toEqual({
        parse: [],
        users: ["applicant-123"],
      });

      await vi.advanceTimersByTimeAsync(
        INCOMPLETE_TICKET_TIMEOUT_MS - INCOMPLETE_TICKET_SECOND_WARNING_AFTER_MS,
      );
      expect(fetchMessages).toHaveBeenCalledWith({ limit: 100 });
      expect(deleteChannel).toHaveBeenCalledWith("Ticket incomplet după 60 de minute");
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts help and report contracts directly from their first question", () => {
    const panel = ticketPanelPayload("help_report");
    const button = panel.components[0]!.toJSON().components[0];
    expect(button && "custom_id" in button ? button.custom_id : undefined).toBe(
      "ticket_start_help_report",
    );
    expect(ticketQuestionModal("help_report", "type")?.toJSON().custom_id).toBe(
      "ticket_answer_help_report_type",
    );
  });

  it("shows a live Discord countdown for ticket completion", () => {
    const deadline = 1_800_000_000_000;
    const panel = ticketPanelPayload("help_report", deadline);
    const embed = panel.embeds[0]!.toJSON();
    const timeField = embed.fields?.find((field) => field.name === "⏳ Termen și stare");

    expect(timeField?.value).toContain(`<t:${Math.floor(deadline / 1000)}:R>`);
    expect(timeField?.value).toContain("un contract incomplet");
  });

  it("keeps the absolute deadline anchored to channel creation", () => {
    const channelCreatedAt = 1_700_000_000_000;
    expect(ticketDeadlineForChannel(
      { createdTimestamp: channelCreatedAt },
      channelCreatedAt + 30 * 60 * 1000,
    )).toBe(channelCreatedAt + INCOMPLETE_TICKET_TIMEOUT_MS);
  });

  it("uses the same absolute deadline for delayed posting and restart refresh", async () => {
    vi.useFakeTimers();
    const channelCreatedAt = 1_700_000_000_000;
    const delayedPanelAt = channelCreatedAt + 15 * 60 * 1000;
    const expectedTimestamp = Math.floor(
      (channelCreatedAt + INCOMPLETE_TICKET_TIMEOUT_MS) / 1000,
    );
    vi.setSystemTime(delayedPanelAt);
    try {
      const send = vi.fn().mockResolvedValue({ id: "delayed-panel-message" });
      const delayedChannel = {
        id: "delayed-panel-channel",
        createdTimestamp: channelCreatedAt,
        isTextBased: () => true,
        messages: { fetch: vi.fn().mockResolvedValue([]) },
        send,
      } as unknown as Message["channel"];

      await postTicketPanelIfMissing(delayedChannel, "help_report", "bot-1");
      const postedPayload = send.mock.calls[0]?.[0] as {
        embeds: { toJSON(): { fields?: { name?: string; value?: string }[] } }[];
      };
      const postedField = postedPayload.embeds[0]?.toJSON().fields?.find(
        (field) => field.name === "⏳ Termen și stare",
      );
      expect(postedField?.value).toContain(`<t:${expectedTimestamp}:F>`);

      const edit = vi.fn().mockResolvedValue(undefined);
      const existingPanel = {
        author: { id: "bot-1" },
        components: [{ components: [{ customId: "ticket_start_help_report" }] }],
        edit,
      };
      const restartChannel = {
        id: "restart-panel-channel",
        createdTimestamp: channelCreatedAt,
        isTextBased: () => true,
        messages: { fetch: vi.fn().mockResolvedValue([existingPanel]) },
        send: vi.fn(),
      } as unknown as Message["channel"];

      await postTicketPanelIfMissing(restartChannel, "help_report", "bot-1");
      const refreshedPayload = edit.mock.calls[0]?.[0] as {
        embeds: { toJSON(): { fields?: { name?: string; value?: string }[] } }[];
      };
      const refreshedField = refreshedPayload.embeds[0]?.toJSON().fields?.find(
        (field) => field.name === "⏳ Termen și stare",
      );
      expect(refreshedField?.value).toContain(`<t:${expectedTimestamp}:F>`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mistake ordinary ticket actions for a panel", () => {
    const actionMessage = {
      author: { id: "bot-1" },
      components: [{
        components: [{ customId: "ticket_alliance_post_123" }],
      }],
    } as unknown as Message;
    const staffPanel = {
      author: { id: "bot-1" },
      components: [{
        components: [{ customId: "ticket_start_staff" }],
      }],
    } as unknown as Message;

    expect(isTicketPanelMessage(actionMessage, "bot-1")).toBe(false);
    expect(isTicketPanelMessage(staffPanel, "bot-1", "partnership")).toBe(false);
    expect(isTicketPanelMessage(staffPanel, "bot-1", "staff")).toBe(true);
  });

  it("retries the interactive panel after a plain-text fallback", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("Discord rejected components"))
      .mockResolvedValueOnce({ id: "fallback-message" })
      .mockResolvedValueOnce({ id: "interactive-message" });
    const channel = {
      id: "panel-retry-channel",
      createdTimestamp: Date.now(),
      isTextBased: () => true,
      messages: { fetch: vi.fn().mockResolvedValue([]) },
      send,
    } as unknown as Message["channel"];

    expect(await postTicketPanelIfMissing(channel, "help_report", "bot-1")).toBe(false);
    expect(await postTicketPanelIfMissing(channel, "help_report", "bot-1")).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      content: expect.stringContaining("Ajutor / Raportare"),
    }));
    expect(send.mock.calls[2]?.[0]).toEqual(expect.objectContaining({
      embeds: expect.any(Array),
    }));
  });

  it("keeps modal input values within Discord limits", () => {
    const longText = "x".repeat(5_000);
    const recruitmentModal = allianceRecruitmentTextModal(longText).toJSON();
    const recruitmentInput =
      recruitmentModal.components[0] &&
      "components" in recruitmentModal.components[0]
        ? recruitmentModal.components[0].components[0]
        : undefined;
    expect(recruitmentInput).toMatchObject({ max_length: 2_000 });
    expect(
      recruitmentInput && "value" in recruitmentInput
        ? recruitmentInput.value?.length
        : 0,
    ).toBe(2_000);

    const staffModal = ticketModal("staff").toJSON();
    for (const row of staffModal.components) {
      if (!("components" in row)) continue;
      for (const component of row.components) {
        if ("max_length" in component) {
          expect(component.max_length).toBeLessThanOrEqual(4_000);
        }
        if ("label" in component && component.label) {
          expect(component.label.length).toBeLessThanOrEqual(45);
        }
        if ("placeholder" in component && component.placeholder) {
          expect(component.placeholder.length).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it("puts the first five staff questions on the first valid modal page", () => {
    const staffModal = ticketModal("staff").toJSON();
    const partnershipModal = ticketModal("partnership").toJSON();

    expect(staffModal.title).toBe("Aplicare Staff · 1/2");
    expect(staffModal.components).toHaveLength(5);
    expect(partnershipModal.components).toHaveLength(5);
    const partnershipIds = partnershipModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );
    expect(partnershipIds).toContain("partnership_description");
  });

  it("uses a second interactive step for the final staff questions", () => {
    const detailsModal = staffDetailsModal().toJSON();
    const detailIds = detailsModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );

    expect(detailsModal.title).toBe("Aplicare Staff · 2/2");
    expect(detailsModal.components).toHaveLength(3);
    expect(detailIds).toEqual(["staff_conflict", "staff_improvements", "staff_tag"]);
  });

  it("uses a second interactive step for the final partnership questions", () => {
    const detailsModal = partnershipDetailsModal().toJSON();
    const detailIds = detailsModal.components.flatMap((row) =>
      "components" in row
        ? row.components.flatMap((component) =>
            "custom_id" in component ? [component.custom_id] : [],
          )
        : [],
    );

    expect(detailsModal.title).toBe("Propunere de Parteneriat · 2/2");
    expect(detailsModal.components).toHaveLength(3);
    expect(detailIds).toEqual([
      "partnership_motivation",
      "partnership_offer",
      "partnership_terms",
    ]);
  });

  it("routes alliance edit submissions through the ticket modal dispatcher", () => {
    expect(
      partnershipEditModal("123", {
        server_name: "Regatul Umbrelor",
        description: "Comunitate RPG medievală.",
        invite: "https://discord.gg/umbrelor",
      }).toJSON().custom_id,
    ).toBe("ticket_form_alliance_edit_submit_123");
  });

  it("shows the final eight staff questions without asking for a timezone", () => {
    const requirements = ticketRequirementsEmbed("staff").toJSON().description;
    expect(requirements).toContain("1. Care este numele tău?");
    expect(requirements).toContain("2. Ce vârstă ai?");
    expect(requirements).toContain("7. Ce ai îmbunătăți pe server?");
    expect(requirements).toContain("8. Accepți să porți tag-ul serverului?");
    expect(requirements).not.toContain("fusul orar");
  });

  it("rejects clear refusals of the mandatory server tag", () => {
    expect(isStaffTagRefusal("Nu")).toBe(true);
    expect(isStaffTagRefusal("nu vreau să îl port")).toBe(true);
    expect(isStaffTagRefusal("Refuz")).toBe(true);
    expect(isStaffTagRefusal("Da, îl voi purta")).toBe(false);
  });

  it("summons the staff role with a medieval Oracle review after completion", () => {
    const payload = staffOracleReviewPayload("Andrei");
    expect(payload.content).toBe(`<@&${STAFF_REVIEW_ROLE_ID}>`);
    expect(payload.allowedMentions.roles).toEqual([STAFF_REVIEW_ROLE_ID]);
    expect(payload.embeds[0]?.toJSON().title).toBe("🕯️ Oracolul · Rezumat pentru evaluare");
    expect(payload.embeds[0]?.toJSON().description).toContain("Andrei");
  });
});