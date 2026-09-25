import { describe, it, expect } from "vitest";
import { z } from "zod";
import { rebaseDraftChanges } from "../utils";

describe("UI API Contract Validation", () => {
  it("rebases only edits made during a save without replacing server-provisioned IDs", () => {
    const submitted = { activityLog: { enabled: true, roleIds: ["12345"], channelIds: { messages: null } }, audit: { enabled: false } };
    const response = { activityLog: { enabled: true, roleIds: ["12345"], channelIds: { messages: "98765" } }, audit: { enabled: false } };
    const current = { activityLog: { enabled: true, roleIds: ["54321"], channelIds: { messages: null } }, audit: { enabled: false } };
    expect(rebaseDraftChanges(response, submitted, current)).toEqual({
      activityLog: { enabled: true, roleIds: ["54321"], channelIds: { messages: "98765" } },
      audit: { enabled: false },
    });
  });

  it("validates notes payload correctly", () => {
    const noteSchema = z.object({ body: z.string().trim().min(1).max(4_000) });
    expect(noteSchema.parse({ body: "This is a note." })).toEqual({ body: "This is a note." });
    expect(() => noteSchema.parse({ content: "Wrong field" })).toThrow();
  });

  it("validates manual action payloads", () => {
    const snowflake = z.string().regex(/^\d{5,25}$/);
    const actionType = z.enum(["warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role"]);
    const actionSchema = z.object({
      type: actionType,
      targetId: snowflake.optional(),
      reason: z.string().trim().min(1).max(500).optional(),
      durationMinutes: z.number().int().min(1).max(40_320).optional(),
      channelId: snowflake.optional(),
      roleId: snowflake.optional(),
      nickname: z.string().trim().min(1).max(32).optional(),
      amount: z.number().int().min(1).max(100).optional(),
    }).superRefine((value, ctx) => {
      if (["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(value.type) && !value.targetId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "targetId is required for this action" });
      }
      if (value.type === "mute" && !value.durationMinutes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "durationMinutes is required for mute" });
      }
      if (value.type === "purge" && !value.amount) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount is required for purge" });
      }
    });

    // Valid payloads
    expect(actionSchema.parse({ type: "mute", targetId: "1234567890", durationMinutes: 60 })).toBeDefined();
    expect(actionSchema.parse({ type: "role", targetId: "1234567890", roleId: "9876543210" })).toBeDefined();
    expect(actionSchema.parse({ type: "nick", targetId: "1234567890", nickname: "NewNick" })).toBeDefined();
    expect(actionSchema.parse({ type: "slowmode", channelId: "1234567890", durationMinutes: 10 })).toBeDefined();

    // Invalid payloads
    expect(() => actionSchema.parse({ type: "mute", targetId: "1234567890" })).toThrow(); // missing duration
    expect(() => actionSchema.parse({ type: "purge", targetId: "1234567890" })).toThrow(); // missing amount
  });

  it("validates If-Match headers format", () => {
    const parseIfMatch = (value: string | undefined) => {
      const match = value?.match(/^"?(\d+)"?$/);
      if (!match) throw new Error("If-Match configuration revision is required");
      const revision = Number(match[1]);
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid configuration revision");
      return revision;
    };

    expect(parseIfMatch('123')).toBe(123);
    expect(parseIfMatch('"123"')).toBe(123);
    expect(() => parseIfMatch(undefined)).toThrow();
    expect(() => parseIfMatch('abc')).toThrow();
  });
});
