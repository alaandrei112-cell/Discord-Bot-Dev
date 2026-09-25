import { PermissionFlagsBits, type GuildMember, type PermissionsBitField } from "discord.js";

export type ModerationActionType =
  | "warn" | "mute" | "kick" | "ban" | "unmute" | "purge"
  | "slowmode" | "lock" | "unlock" | "nick" | "role";

export type PermissionSubject = Pick<GuildMember, "id" | "roles" | "permissions"> & {
  manageable?: boolean;
  bannable?: boolean;
  kickable?: boolean;
  moderatable?: boolean;
};

export function requiredPermission(action: ModerationActionType): bigint {
  switch (action) {
    case "warn":
    case "mute":
    case "unmute":
      return PermissionFlagsBits.ModerateMembers;
    case "kick":
      return PermissionFlagsBits.KickMembers;
    case "ban":
      return PermissionFlagsBits.BanMembers;
    case "purge":
      return PermissionFlagsBits.ManageMessages;
    case "slowmode":
    case "lock":
    case "unlock":
      return PermissionFlagsBits.ManageChannels;
    case "nick":
      return PermissionFlagsBits.ManageNicknames;
    case "role":
      return PermissionFlagsBits.ManageRoles;
  }
}

export function hasDiscordPermission(member: Pick<PermissionSubject, "permissions">, action: ModerationActionType): boolean {
  return (member.permissions as PermissionsBitField).has(requiredPermission(action));
}

export function hasManualGrant(
  member: Pick<PermissionSubject, "roles" | "permissions">,
  action: ModerationActionType,
  grants: Record<string, readonly string[] | undefined> | undefined,
): boolean {
  if ((member.permissions as PermissionsBitField).has(PermissionFlagsBits.Administrator)) return true;
  const permittedRoles = grants?.[action] ?? [];
  return member.roles.cache.some((role) => permittedRoles.includes(role.id));
}

export function assertTargetHierarchy(
  actor: PermissionSubject,
  bot: PermissionSubject,
  target: PermissionSubject,
  action: "warn" | "mute" | "kick" | "ban" | "unmute" | "nick" | "role",
  protectedRoleIds: readonly string[] = [],
): void {
  if (target.id === actor.id) throw new Error("Nu te poți modera pe tine însuți.");
  if (target.id === target.roles.guild.ownerId) throw new Error("Proprietarul serverului este întotdeauna protejat.");
  if (target.roles.cache.some((role) => protectedRoleIds.includes(role.id))) {
    throw new Error("Ținta are un rol protejat.");
  }
  const actorHighest = actor.roles.highest.position;
  const targetHighest = target.roles.highest.position;
  const botHighest = bot.roles.highest.position;
  if (targetHighest >= actorHighest && actor.id !== actor.roles.guild.ownerId) {
    throw new Error("Ierarhia rolurilor nu îți permite moderarea acestei ținte.");
  }
  if (targetHighest >= botHighest && target.id !== target.roles.guild.ownerId) {
    throw new Error("Ierarhia rolurilor nu permite botului această acțiune.");
  }
  // These flags belong to the target member. Checking the bot's own flags would
  // reject valid actions and would not establish that the target is actionable.
  const allowed = action === "ban" ? target.bannable : action === "kick" ? target.kickable : action === "mute" || action === "unmute" ? target.moderatable : target.manageable;
  if (!allowed) throw new Error("Botul nu are permisiunea sau ierarhia necesară.");
}

export function assertRoleGrantSafe(
  actor: PermissionSubject,
  bot: PermissionSubject,
  role: { id: string; name?: string; position: number; managed: boolean; permissions: PermissionsBitField },
  protectedRoleIds: readonly string[] = [],
): void {
  if (role.name === "@everyone" || protectedRoleIds.includes(role.id) || role.managed) throw new Error("Rolul este protejat sau gestionat de o integrare.");
  if (role.position >= actor.roles.highest.position || role.position >= bot.roles.highest.position) {
    throw new Error("Rolul este deasupra ierarhiei actorului sau botului.");
  }
  // A role must not grant *any* effective capability the actor does not
  // already possess—not just Administrator/ManageGuild. This closes indirect
  // escalation through ManageRoles, BanMembers, webhooks, etc.
  if ((role.permissions.bitfield & ~actor.permissions.bitfield) !== 0n) {
    throw new Error("Nu poți acorda un rol care ar escalada privilegiile actorului.");
  }
}