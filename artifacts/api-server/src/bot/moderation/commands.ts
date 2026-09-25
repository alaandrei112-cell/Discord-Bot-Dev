import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getModerationWebsiteUrl } from "../../moderation/oauth";
import { executeModerationAction, type ModerationActionInput } from "./engine";

export const moderationCommands = [
  new SlashCommandBuilder()
    .setName("moderare")
    .setDescription("Acces securizat la panoul de moderare")
    .addSubcommand((sub) => sub.setName("login").setDescription("Deschide autentificarea Discord pentru site")),
  new SlashCommandBuilder().setName("warn").setDescription("Avertizează un membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("mute").setDescription("Aplică timeout unui membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addIntegerOption((o) => o.setName("minutes").setDescription("Minute (max. 28 zile)").setRequired(true).setMinValue(1).setMaxValue(40_320))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("unmute").setDescription("Ridică timeout-ul unui membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("kick").setDescription("Elimină un membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("ban").setDescription("Banează un membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("purge").setDescription("Șterge mesaje recente din canal")
    .addIntegerOption((o) => o.setName("amount").setDescription("1–100 mesaje").setRequired(true).setMinValue(1).setMaxValue(100))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("slowmode").setDescription("Setează slowmode-ul canalului")
    .addIntegerOption((o) => o.setName("seconds").setDescription("0–21600 secunde").setRequired(true).setMinValue(0).setMaxValue(21_600))
    .addChannelOption((o) => o.setName("channel").setDescription("Canalul (implicit acesta)").addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("lock").setDescription("Blochează trimiterea mesajelor în canal")
    .addChannelOption((o) => o.setName("channel").setDescription("Canalul (implicit acesta)").addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("unlock").setDescription("Restaurează permisiunile canalului")
    .addChannelOption((o) => o.setName("channel").setDescription("Canalul (implicit acesta)").addChannelTypes(ChannelType.GuildText))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("nick").setDescription("Schimbă nickname-ul unui membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("Noul nickname").setRequired(true).setMinLength(1).setMaxLength(32))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
  new SlashCommandBuilder().setName("role").setDescription("Adaugă un rol neprivilegiat unui membru")
    .addUserOption((o) => o.setName("user").setDescription("Membrul").setRequired(true))
    .addRoleOption((o) => o.setName("role").setDescription("Rolul").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Motivul").setMaxLength(500)),
].map((command) => command.toJSON());

const actionNames = new Set<ModerationActionInput["type"]>([
  "warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role",
]);

export async function handleModerationCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (interaction.commandName === "moderare") {
    if (interaction.options.getSubcommand() !== "login") return false;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply(
      `Deschide panoul de moderare și autentifică-te cu Discord: ${getModerationWebsiteUrl()}\n` +
      "Accesul este verificat din nou pentru serverele în care botul este prezent.",
    );
    return true;
  }
  if (!actionNames.has(interaction.commandName as ModerationActionInput["type"])) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const type = interaction.commandName as ModerationActionInput["type"];
  const target = interaction.options.getUser("user");
  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");
  const result = await executeModerationAction({
    guildId: interaction.guildId!,
    actorId: interaction.user.id,
    type,
    targetId: target?.id,
    channelId: channel?.id ?? (["warn", "purge", "slowmode", "lock", "unlock"].includes(type) ? interaction.channelId : undefined),
    roleId: role?.id,
    nickname: interaction.options.getString("nickname") ?? undefined,
    amount: interaction.options.getInteger("amount") ?? interaction.options.getInteger("seconds") ?? undefined,
    durationMinutes: interaction.options.getInteger("minutes") ?? undefined,
    reason: interaction.options.getString("reason") ?? undefined,
    idempotencyKey: `discord:${interaction.id}`,
  });
  await interaction.editReply(`✅ ${result.summary ?? "Acțiunea de moderare a fost aplicată."}${result.caseId ? ` Caz: \`${result.caseId}\`.` : ""}`);
  return true;
}

/** Discord's default member permissions provide UI guidance; engine checks remain authoritative. */
export const MODERATION_COMMAND_DEFAULT_PERMISSION = PermissionFlagsBits.ModerateMembers;