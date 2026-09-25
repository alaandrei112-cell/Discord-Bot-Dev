export type DetectorKind =
  | "word"
  | "link"
  | "caps"
  | "emoji"
  | "repeat"
  | "length"
  | "characters"
  | "symbols"
  | "mentions"
  | "messageSpam"
  | "editSpam"
  | "deleteSpam"
  | "joinRaid"
  | "newAccount"
  | "scam";

export type Detection = {
  kind: DetectorKind;
  detail: string;
  count?: number;
};

export type ContentThresholds = {
  capsPercent?: number;
  emoji?: number;
  repeat?: number;
  maxLength?: number;
  maxCharacterRun?: number;
  maxSymbolRun?: number;
  mentions?: number;
};

export type RateThresholds = {
  limit: number;
  windowMs: number;
};

export function normalizeModerationText(value: string): string {
  return value
    .toLocaleLowerCase("ro-RO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsBlockedWord(content: string, words: readonly string[]): string | null {
  const normalized = normalizeModerationText(content);
  for (const raw of words) {
    const word = normalizeModerationText(raw);
    if (!word || word.length > 100) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(word)}(?=$|[^\\p{L}\\p{N}])`, "u");
    if (pattern.test(normalized)) return raw.trim();
  }
  return null;
}

function normalizeScamText(value: string): string {
  return normalizeModerationText(value).replace(/[\u200B-\u200F\u2060\uFEFF]/g, "");
}

export function detectScamContent(content: string, configuredPhrases: readonly string[] = []): Detection | null {
  const normalized = normalizeScamText(content);
  if (!normalized) return null;

  const configuredPhrase = containsBlockedWord(normalized, configuredPhrases);
  if (configuredPhrase) {
    return { kind: "scam", detail: `Expresie anti-scam configurată: ${configuredPhrase}` };
  }

  const winningClaim = /\b(?:(?:you|i|we)(?:'ve)?\s+(?:(?:have|has)\s+)?(?:just\s+)?won|just\s+won|won|winner|winning|(?:ai|am|a|ati)\s+(?:tocmai\s+)?castig(?:at|ata|ate|ati|ator|atoare)?|castigator(?:i|e)?|castiguri)\b/u;
  const moneyAmount = /(?:[$€£]\s*\d[\d.,]*|\b\d[\d.,]*\s*(?:de\s*)?(?:usd|dollars?|dola(?:r|ri)|eur|euros?|ron|lei|btc|bitcoin|eth|ethereum|usdt|sol)\b|\b(?:usd|dollars?|dola(?:r|ri)|eur|euros?|ron|lei|btc|bitcoin|eth|ethereum|usdt|sol)\s*\d[\d.,]*\b)/u;
  if (winningClaim.test(normalized) && moneyAmount.test(normalized)) {
    return { kind: "scam", detail: "Afirmație despre câștig în bani sau criptomonede" };
  }

  const highRiskOffer = /\b(?:claim(?: your)? (?:free )?(?:prize|reward|bonus)|free (?:money|crypto|bitcoin|btc|ethereum|eth|usd|usdt)|(?:verify|connect) (?:your )?wallet|wallet (?:verification|verify)|(?:crypto|bitcoin|btc|ethereum|eth|usdt) (?:airdrop|giveaway)|double your (?:money|crypto|bitcoin|btc)|you(?:'ve)? been selected (?:for|to win))\b/u;
  if (highRiskOffer.test(normalized)) {
    return { kind: "scam", detail: "Promisiune suspectă de recompensă sau verificare de portofel" };
  }

  return null;
}

export function findBlockedLink(content: string, blockedLinks: readonly string[]): string | null {
  const urls = content.match(/(?:https?:\/\/|www\.)[^\s<>()]+/gi) ?? [];
  for (const url of urls) {
    let hostname = "";
    try {
      hostname = new URL(url.startsWith("www.") ? `https://${url}` : url).hostname.toLowerCase();
    } catch {
      continue;
    }
    for (const configured of blockedLinks) {
      const normalized = configured.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!normalized) continue;
      if (hostname === normalized || hostname.endsWith(`.${normalized}`)) return configured.trim();
    }
  }
  return null;
}

export function countEmoji(content: string): number {
  const unicodeEmoji = content.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
  const customEmoji = content.match(/<a?:[A-Za-z0-9_~]+:\d+>/g)?.length ?? 0;
  return unicodeEmoji + customEmoji;
}

export function capsPercent(content: string): number {
  const letters = content.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const upper = letters.filter((char) => char === char.toLocaleUpperCase("ro-RO")).length;
  return Math.round((upper / letters.length) * 100);
}

export function longestRepeatedRun(content: string): number {
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const char of Array.from(normalizeModerationText(content))) {
    if (char === previous) current += 1;
    else {
      previous = char;
      current = 1;
    }
    longest = Math.max(longest, current);
  }
  return longest;
}

export function longestSymbolRun(content: string): number {
  let longest = 0;
  let current = 0;
  for (const char of Array.from(content)) {
    if (/[\p{P}\p{S}]/u.test(char)) current += 1;
    else current = 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function countMentions(content: string): number {
  return (content.match(/<@!?\d+>|<@&\d+>|@everyone|@here/g) ?? []).length;
}

export function detectContent(
  content: string,
  options: {
    blockedWords?: readonly string[];
    blockedLinks?: readonly string[];
    thresholds?: ContentThresholds;
  },
): Detection[] {
  const results: Detection[] = [];
  const thresholds = options.thresholds ?? {};
  const word = containsBlockedWord(content, options.blockedWords ?? []);
  if (word) results.push({ kind: "word", detail: `Cuvânt filtrat: ${word}` });
  const link = findBlockedLink(content, options.blockedLinks ?? []);
  if (link) results.push({ kind: "link", detail: `Link blocat: ${link}` });

  const emoji = countEmoji(content);
  if (thresholds.emoji !== undefined && emoji > thresholds.emoji) results.push({ kind: "emoji", detail: "Prea multe emoji", count: emoji });
  const caps = capsPercent(content);
  if (thresholds.capsPercent !== undefined && caps >= thresholds.capsPercent) results.push({ kind: "caps", detail: "Prea multe majuscule", count: caps });
  const repeated = longestRepeatedRun(content);
  if (thresholds.repeat !== undefined && repeated >= thresholds.repeat) results.push({ kind: "repeat", detail: "Caractere repetate", count: repeated });
  if (thresholds.maxLength !== undefined && content.length > thresholds.maxLength) results.push({ kind: "length", detail: "Mesaj prea lung", count: content.length });
  if (thresholds.maxCharacterRun !== undefined && repeated >= thresholds.maxCharacterRun) results.push({ kind: "characters", detail: "Flood de caractere", count: repeated });
  const symbols = longestSymbolRun(content);
  if (thresholds.maxSymbolRun !== undefined && symbols >= thresholds.maxSymbolRun) results.push({ kind: "symbols", detail: "Flood de simboluri", count: symbols });
  const mentions = countMentions(content);
  if (thresholds.mentions !== undefined && mentions > thresholds.mentions) results.push({ kind: "mentions", detail: "Prea multe mențiuni", count: mentions });
  return results;
}

/** A bounded, guild-isolated fixed-window counter for message/event burst rules. */
export class SlidingRateLimiter {
  private readonly samples = new Map<string, number[]>();

  hit(key: string, thresholds: RateThresholds, now = Date.now()): { count: number; exceeded: boolean } {
    const cutoff = now - Math.max(1, thresholds.windowMs);
    const kept = (this.samples.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    kept.push(now);
    this.samples.set(key, kept);
    return { count: kept.length, exceeded: kept.length > Math.max(0, thresholds.limit) };
  }

  clear(key: string): void {
    this.samples.delete(key);
  }
}