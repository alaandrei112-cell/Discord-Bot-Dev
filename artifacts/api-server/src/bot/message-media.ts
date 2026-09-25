import { EmbedBuilder } from "discord.js";

export function normalizeMessageImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim().slice(0, 2_000);
  return /^https:\/\/\S+$/i.test(candidate) || /^\/api\/storage\/objects\/[a-zA-Z0-9/_-]+$/.test(candidate)
    ? candidate
    : "";
}

export function publicMessageImageUrl(value: unknown): string | null {
  const normalized = normalizeMessageImageUrl(value);
  if (!normalized) return null;
  if (normalized.startsWith("https://")) return normalized;
  const domain = (process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN ?? "")
    .split(",")[0]?.trim();
  return domain ? `https://${domain}${normalized}` : null;
}

export function messageWithImage(content: string, imageUrl: unknown, thumbnailUrl?: unknown) {
  const publicUrl = publicMessageImageUrl(imageUrl);
  const publicThumbnailUrl = publicMessageImageUrl(thumbnailUrl);
  return {
    content,
    ...(publicUrl || publicThumbnailUrl
      ? {
          embeds: [
            new EmbedBuilder()
              .setImage(publicUrl)
              .setThumbnail(publicThumbnailUrl),
          ],
        }
      : {}),
  };
}