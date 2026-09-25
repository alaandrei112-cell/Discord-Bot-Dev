import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
} from "discord.js";
import { loadVerificationConfig, saveVerificationConfig, type VerificationConfig } from "./db";
import { normalizeMessageImageUrl, publicMessageImageUrl } from "./message-media";

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  enabled: false,
  channelId: "",
  roleId: "",
  title: "Verifică-ți contul",
  message: "Apasă butonul de mai jos pentru a confirma că deții contul Discord și pentru a primi rolul comunității.",
  buttonLabel: "Verifică-mă",
  buttonEmoji: "✅",
  successMessage: "Contul tău a fost verificat. Rolul a fost acordat.",
  alreadyVerifiedMessage: "Contul tău este deja verificat.",
  imageUrl: "",
  thumbnailUrl: "",
  panelMessageId: "",
};

export function normalizeVerificationConfig(value: Partial<VerificationConfig> | null | undefined): VerificationConfig {
  return {
    ...DEFAULT_VERIFICATION_CONFIG,
    ...(value ?? {}),
    enabled: value?.enabled === true,
    channelId: typeof value?.channelId === "string" ? value.channelId.trim() : "",
    roleId: typeof value?.roleId === "string" ? value.roleId.trim() : "",
    title: typeof value?.title === "string" && value.title.trim() ? value.title.trim() : DEFAULT_VERIFICATION_CONFIG.title,
    message: typeof value?.message === "string" && value.message.trim() ? value.message.trim() : DEFAULT_VERIFICATION_CONFIG.message,
    buttonLabel: typeof value?.buttonLabel === "string" && value.buttonLabel.trim() ? value.buttonLabel.trim() : DEFAULT_VERIFICATION_CONFIG.buttonLabel,
    buttonEmoji: typeof value?.buttonEmoji === "string" ? value.buttonEmoji.trim() : "",
    successMessage: typeof value?.successMessage === "string" && value.successMessage.trim() ? value.successMessage.trim() : DEFAULT_VERIFICATION_CONFIG.successMessage,
    alreadyVerifiedMessage: typeof value?.alreadyVerifiedMessage === "string" && value.alreadyVerifiedMessage.trim() ? value.alreadyVerifiedMessage.trim() : DEFAULT_VERIFICATION_CONFIG.alreadyVerifiedMessage,
    imageUrl: normalizeMessageImageUrl(value?.imageUrl),
    thumbnailUrl: normalizeMessageImageUrl(value?.thumbnailUrl),
    panelMessageId: typeof value?.panelMessageId === "string" ? value.panelMessageId.trim() : "",
  };
}

export function verificationPanel(config: VerificationConfig) {
  const labelCustomEmoji = /<(a?):([a-zA-Z0-9_]+):(\d+)>/.exec(config.buttonLabel);
  const cleanLabel = config.buttonLabel.replace(/<(?:a?):[a-zA-Z0-9_]+:\d+>/g, "").trim() || "Verifică-mă";
  const button = new ButtonBuilder()
    .setCustomId("verification_start")
    .setLabel(cleanLabel.slice(0, 80))
    .setStyle(ButtonStyle.Primary);
  if (config.buttonEmoji || labelCustomEmoji) {
    const custom = /^<(a?):([a-zA-Z0-9_]+):(\d+)>$/.exec(config.buttonEmoji) || labelCustomEmoji;
    button.setEmoji(custom
      ? { id: custom[3], name: custom[2], animated: custom[1] === "a" }
      : config.buttonEmoji);
  }
  const embed = new EmbedBuilder()
    .setTitle(config.title.slice(0, 256))
    .setDescription(config.message.slice(0, 4_000))
    .setColor(0x8f5bff);
  const imageUrl = publicMessageImageUrl(config.imageUrl);
  const thumbnailUrl = publicMessageImageUrl(config.thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return {
    embeds: [
      embed,
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export async function publishVerificationPanel(client: Client, guildId: string, input: VerificationConfig): Promise<VerificationConfig> {
  const config = normalizeVerificationConfig(input);
  if (!config.enabled) return config;
  if (!config.channelId || !config.roleId) throw new Error("Configurează canalul și rolul pentru verificare.");

  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const channel = await guild.channels.fetch(config.channelId);
  if (!channel?.isTextBased() || !("send" in channel)) throw new Error("Canalul de verificare nu este un canal text.");

  const payload = verificationPanel(config);
  let messageId = config.panelMessageId;
  if (messageId && "messages" in channel) {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.edit(payload);
    } catch {
      messageId = "";
    }
  }
  if (!messageId) {
    const message = await channel.send(payload);
    messageId = message.id;
  }

  const saved = { ...config, panelMessageId: messageId };
  await saveVerificationConfig(guildId, saved);
  return saved;
}

export async function verifyMember(client: Client, guildId: string, userId: string): Promise<"verified" | "already_verified"> {
  const config = normalizeVerificationConfig(await loadVerificationConfig(guildId));
  if (!config.enabled || !config.roleId) throw new Error("Verificarea nu este configurată pentru acest server.");

  const guild = await client.guilds.fetch({ guild: guildId, force: true });
  const member = await guild.members.fetch(userId);
  const role = await guild.roles.fetch(config.roleId);
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  if (!role) throw new Error("Rolul de verificare nu mai există.");
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error("Botul nu are permisiunea Manage Roles.");
  if (role.managed || role.position >= botMember.roles.highest.position) {
    throw new Error("Rolul de verificare trebuie să fie sub rolul botului și să nu fie managed.");
  }
  if (member.roles.cache.has(role.id)) return "already_verified";
  await member.roles.add(role, "Verificare confirmată prin site");
  return "verified";
}

const COOKIE_NAME = "verification_identity";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

function signingSecret(): string {
  return process.env.SESSION_SECRET?.trim() || "development-verification-secret";
}

export function createVerificationIdentityToken(guildId: string, userId: string): string {
  const payload = Buffer.from(JSON.stringify({ guildId, userId, exp: Date.now() + COOKIE_TTL_SECONDS * 1_000 }), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function parseVerificationIdentityToken(token: string | undefined): { guildId: string; userId: string } | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { guildId?: unknown; userId?: unknown; exp?: unknown };
    return typeof value.guildId === "string" && typeof value.userId === "string" && typeof value.exp === "number" && value.exp > Date.now()
      ? { guildId: value.guildId, userId: value.userId }
      : null;
  } catch {
    return null;
  }
}

export function verificationCookieName(): string {
  return COOKIE_NAME;
}

export async function handleVerificationButton(interaction: ButtonInteraction, websiteUrl: string): Promise<void> {
  await interaction.reply({
    content: `Confirmă-ți identitatea pe site pentru a primi rolul:\n${websiteUrl}`,
    flags: MessageFlags.Ephemeral,
  });
}