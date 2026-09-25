import { describe, expect, it } from "vitest";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { assertRoleGrantSafe, assertTargetHierarchy, hasDiscordPermission } from "../policy";

function member(id: string, position: number, permissions = 0n) {
  const role = { id: `${id}-role`, position };
  return {
    id,
    permissions: new PermissionsBitField(permissions),
    roles: {
      highest: { position },
      guild: { ownerId: "owner" },
      cache: { some: (predicate: (value: typeof role) => boolean) => predicate(role) },
    },
    manageable: true,
    bannable: true,
    kickable: true,
    moderatable: true,
  } as any;
}

describe("manual moderation policy", () => {
  it("requires the matching Discord permission", () => {
    expect(hasDiscordPermission(member("staff", 10, PermissionFlagsBits.BanMembers), "ban")).toBe(true);
    expect(hasDiscordPermission(member("staff", 10, PermissionFlagsBits.BanMembers), "kick")).toBe(false);
  });

  it("rejects a target at or above actor/bot hierarchy and protected roles", () => {
    expect(() => assertTargetHierarchy(member("staff", 10), member("bot", 20), member("target", 10), "mute")).toThrow(/Ierarhia rolurilor/);
    expect(() => assertTargetHierarchy(member("staff", 20), member("bot", 30), member("target", 5), "ban", ["target-role"])).toThrow(/protejat/);
    expect(() => assertTargetHierarchy(member("staff", 20), member("bot", 10), member("target", 15), "kick")).toThrow(/botului/);
    expect(() => assertTargetHierarchy(member("staff", 20), member("bot", 30), member("owner", 1), "ban")).toThrow(/Proprietarul/);
    const unmanageable = member("target", 5);
    unmanageable.moderatable = false;
    expect(() => assertTargetHierarchy(member("staff", 20), member("bot", 30), unmanageable, "mute")).toThrow(/permisiunea sau ierarhia/);
  });

  it("allows a normal lower-role target but never allows role escalation", () => {
    expect(() => assertTargetHierarchy(member("staff", 20), member("bot", 30), member("target", 5), "mute")).not.toThrow();
    const privileged = {
      id: "admin-role", position: 5, managed: false, permissions: new PermissionsBitField(PermissionFlagsBits.Administrator),
    };
    expect(() => assertRoleGrantSafe(member("staff", 20), member("bot", 30), privileged)).toThrow(/escalada privilegiile/);
    expect(() => assertRoleGrantSafe(member("staff", 20), member("bot", 30), {
      id: "high-role", position: 20, managed: false, permissions: new PermissionsBitField(),
    })).toThrow(/ierarhiei/);
    expect(() => assertRoleGrantSafe(member("staff", 20), member("bot", 30), {
      id: "managed", position: 5, managed: true, permissions: new PermissionsBitField(),
    })).toThrow(/protejat/);
    expect(() => assertRoleGrantSafe(member("staff", 20), member("bot", 30), {
      id: "everyone", name: "@everyone", position: 0, managed: false, permissions: new PermissionsBitField(),
    })).toThrow(/protejat/);
  });
});