// The Oracle mood engine. Tracks server activity (and, when enabled, toxicity)
// from a messageCreate feed, derives a "mood", and after a full hour of silence
// posts one flavor reaction in the main channel. It also rewards consistent
// chatters with temporary blessings and penalizes toxic/spam users with curses
// (see status-effects.ts), which feed straight into combat.
//
// All state is in-memory and ephemeral by design (mirrors combat-events.ts):
// activity windows and cooldowns reset on restart, which is fine for a feature
// whose effects last only minutes.
//
// Privacy: message CONTENT is only inspected for keyword toxicity and is NEVER
// logged or echoed. Curses are announced in lore language, never by quoting.

import { ActivityType, Client, TextChannel } from "discord.js";
import { logger } from "../lib/logger";
import {
  MOOD_META,
  ACTIVITY_REACTIONS,
  TOXICITY_REACTIONS,
  PROPHECY_FLAVOR,
  type MoodState,
} from "./oracle-content";
import { grantRandomBlessing, grantRandomCurse, pruneAllEffects } from "./status-effects";
import { isTicketCategoryParentId } from "./ticket-categories";

const MIN = 60 * 1000;

function envInt(name: string, fallback: number, max: number): number {
  const raw = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(raw) || raw < 0) return fallback;
  return Math.min(raw, max);
}

// Rolling windows.
const ACTIVITY_WINDOW_MS = 60 * MIN;     // per-user activity considered for blessings
const MOOD_WINDOW_MS = 30 * MIN;         // window the mood/posting cadence reacts to
const TOXICITY_WINDOW_MS = 30 * MIN;     // window toxic hits are counted in
const SPAM_WINDOW_MS = 2 * MIN;          // window a spam burst is measured in
const SILENCE_FOR_TACUT_MS = 2 * 60 * MIN;

// Posting cadence (balanced).
const MIN_TICK_MS = 30 * MIN;
const MAX_TICK_MS = 60 * MIN;
const FIRST_TICK_MS = 12 * MIN;
// Behavior-grant thresholds.
const BLESS_COOLDOWN_MS = 4 * 60 * MIN;
const CURSE_COOLDOWN_MS = 2 * 60 * MIN;
const BLESS_MIN_MSGS = 6;                 // messages in ACTIVITY_WINDOW
const BLESS_MIN_SPAN_MS = 10 * MIN;       // spread out (a quick burst doesn't earn a buff)
const CURSE_TOXIC_HITS = 2;               // toxic hits in TOXICITY_WINDOW
const SPAM_BURST = 10;                    // messages in SPAM_WINDOW counts as spam
const MAX_GRANTS_PER_TICK = 2;

const EXTATIC_MS = 15 * MIN;
const PROPHECY_CHANCE = 0.3;
const CHECKIN_RESPONSE_WINDOW_MS = envInt("ORACLE_CHECKIN_RESPONSE_WINDOW_MS", 15 * MIN, 60 * MIN);
// Proactive mood check-ins are opt-in. The Oracle may still use its mood for
// replies and presence, but it must not publish unsolicited state messages by
// default in the server channels.
const CHECKIN_ENABLED = process.env.ORACLE_CHECKIN_ENABLED === "true";
const CHECKIN_SILENCE_MS = 60 * MIN;

const MESSAGE_CONTENT_ENABLED = process.env.ORACLE_MESSAGE_CONTENT_ENABLED === "true";

// ─── In-memory state ──────────────────────────────────────────────────────────
interface ActiveCheckIn {
  messageId: string;
  channelId: string;
  openedAt: number;
  expiresAt: number;
  responders: Set<string>;
  positive: number;
  negative: number;
  neutral: number;
}

interface GuildOracleState {
  globalMsgTimes: number[];
  userMsgTimes: Map<string, number[]>;
  userToxicTimes: Map<string, number[]>;
  lastBlessAt: Map<string, number>;
  lastCurseAt: Map<string, number>;
  lastMessageAt: number;
  lastCheckInAt: number;
  activeCheckIn: ActiveCheckIn | null;
  runGeneration: number;
  running: boolean;
}

const DEFAULT_GUILD_ID = "__default__";
const guildOracleStates = new Map<string, GuildOracleState>();
const manuallyStoppedGuilds = new Set<string>();
let extaticUntil = 0;
let lastPresenceMood: MoodState | null = null;

function getGuildState(guildId = DEFAULT_GUILD_ID): GuildOracleState {
  let state = guildOracleStates.get(guildId);
  if (!state) {
    state = {
      globalMsgTimes: [],
      userMsgTimes: new Map(),
      userToxicTimes: new Map(),
      lastBlessAt: new Map(),
      lastCurseAt: new Map(),
      lastMessageAt: 0,
      lastCheckInAt: 0,
      activeCheckIn: null,
      runGeneration: 0,
      running: false,
    };
    guildOracleStates.set(guildId, state);
  }
  return state;
}

export function isOracleEnabled(guildId: string): boolean {
  return !manuallyStoppedGuilds.has(guildId);
}

function invalidateOracleRun(guildId: string): void {
  const state = getGuildState(guildId);
  state.runGeneration += 1;
  state.running = false;
}

export function stopOracle(guildId: string): void {
  manuallyStoppedGuilds.add(guildId);
  invalidateOracleRun(guildId);
  logger.info({ guildId }, "Oracle AI stopped by administrator");
}

export function resumeOracle(guildId: string): void {
  manuallyStoppedGuilds.delete(guildId);
}

// Romanian toxicity keyword stems (substring match on a diacritics-stripped,
// lowercased copy). Kept deliberately small; penalties are tiny and temporary,
// so occasional false positives are acceptable.
const TOXIC_STEMS = [
  "pula", "pizda", "muie", "cacat", "rahat", "dracu", "bou", "vaca",
  "prost", "idiot", "imbecil", "tampit", "cretin", "retard", "handicap",
  "jeg", "gunoi", "scarba", "labagiu", "fraier", "nesimtit",
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isToxic(content: string): boolean {
  if (!content) return false;
  const text = normalize(content);
  return TOXIC_STEMS.some((w) => text.includes(w));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function countInWindow(times: number[], windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  let drop = 0;
  while (drop < times.length && times[drop]! < cutoff) drop++;
  if (drop > 0) times.splice(0, drop);
  return times.length;
}

function recentCount(times: number[] | undefined, windowMs: number, now: number): number {
  if (!times) return 0;
  const cutoff = now - windowMs;
  let n = 0;
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i]! > cutoff) n++;
    else break;
  }
  return n;
}

export function classifyCheckInReply(content: string): "positive" | "negative" | "neutral" {
  const text = normalize(content);
  const positive = [
    "bine", "super", "excelent", "fericit", "fericita", "vesel", "vesela",
    "multumesc", "mersi", "iubesc", "rad", "razi", "distractie", "distram",
    "gata", "perfect", "minunat", "minunata", "victorie", "victoriosi",
    "binecuvantat", "binecuvantata", "haha", "hahaha", "😂", "❤️", "❤",
  ];
  const negative = [
    "rau", "prost", "trist", "trista", "suparat", "suparata", "furios",
    "furioasa", "plictisit", "plictisita", "obosit", "obosita", "urat",
    "ura", "enervat", "enervata", "cearta", "m-am saturat", "nu mai pot",
    "nasol", "groaznic", "dezamagit", "dezamagita", "😡", "😠", "😭",
  ];
  const hasPositive = positive.some((word) => text.includes(word));
  const hasNegative = negative.some((word) => text.includes(word));
  if (hasPositive && !hasNegative) return "positive";
  if (hasNegative && !hasPositive) return "negative";
  return "neutral";
}

/** Records a guild message for activity/toxicity and check-in tracking. Never logs content. */
export function recordMessage(
  userId: string,
  _displayName: string,
  content: string,
  guildId = DEFAULT_GUILD_ID,
  channelId?: string,
  messageId?: string,
  referenceMessageId?: string,
): void {
  const state = getGuildState(guildId);
  const now = Date.now();
  state.lastMessageAt = now;

  state.globalMsgTimes.push(now);
  if (state.globalMsgTimes.length > 500) state.globalMsgTimes.splice(0, state.globalMsgTimes.length - 500);

  const arr = state.userMsgTimes.get(userId) ?? [];
  arr.push(now);
  if (arr.length > 300) arr.splice(0, arr.length - 300);
  state.userMsgTimes.set(userId, arr);

  if (MESSAGE_CONTENT_ENABLED && isToxic(content)) {
    const t = state.userToxicTimes.get(userId) ?? [];
    t.push(now);
    if (t.length > 100) t.splice(0, t.length - 100);
    state.userToxicTimes.set(userId, t);
  }

  const checkIn = state.activeCheckIn;
  if (
    checkIn &&
    channelId === checkIn.channelId &&
    now <= checkIn.expiresAt &&
    now >= checkIn.openedAt &&
    messageId !== checkIn.messageId &&
    (referenceMessageId === checkIn.messageId || now > checkIn.openedAt)
  ) {
    state.activeCheckIn = checkIn;
    if (!checkIn.responders.has(userId)) {
      checkIn.responders.add(userId);
      const sentiment = classifyCheckInReply(content);
      if (sentiment === "positive") checkIn.positive++;
      else if (sentiment === "negative") checkIn.negative++;
      else checkIn.neutral++;
    }
  }
}

function totalToxicInWindow(state: GuildOracleState, now: number): number {
  let n = 0;
  for (const times of state.userToxicTimes.values()) n += recentCount(times, TOXICITY_WINDOW_MS, now);
  return n;
}

function anySpamBurst(state: GuildOracleState, now: number): boolean {
  for (const times of state.userMsgTimes.values()) {
    if (recentCount(times, SPAM_WINDOW_MS, now) >= SPAM_BURST) return true;
  }
  return false;
}

export function getCurrentMood(guildId = DEFAULT_GUILD_ID): MoodState {
  const state = getGuildState(guildId);
  const now = Date.now();
  if (state.lastMessageAt === 0 || now - state.lastMessageAt > SILENCE_FOR_TACUT_MS) return "tacut";

  const activity = countInWindow(state.globalMsgTimes, MOOD_WINDOW_MS);
  const toxic = totalToxicInWindow(state, now);
  const checkIn = state.activeCheckIn;
  if (checkIn && now <= checkIn.expiresAt) {
    const socialMood = deriveMoodFromCheckIn(checkIn.positive, checkIn.negative);
    if (socialMood) return socialMood;
  }

  if (toxic >= 5) return "furios";
  if (toxic >= 2) return "iritat";
  if (now < extaticUntil) return "extatic";
  if (anySpamBurst(state, now) && toxic === 0) return "confuz";
  if (activity >= 40) return "agitat";
  if (activity <= 3) return "somnoros";
  return "calm";
}

export function deriveMoodFromCheckIn(positive: number, negative: number): MoodState | null {
  if (negative >= 3 && negative > positive + 1) return "furios";
  if (negative >= 2 && negative > positive) return "iritat";
  if (positive >= 3 && positive > negative + 1) return "extatic";
  if (positive >= 2 && positive > negative) return "agitat";
  return null;
}

/** A check-in is due only once after a full silent hour following a message. */
export function isOracleCheckInDue(
  lastMessageAt: number,
  lastCheckInAt: number,
  now = Date.now(),
  silenceMs = CHECKIN_SILENCE_MS,
): boolean {
  return lastMessageAt > 0 && now - lastMessageAt >= silenceMs && lastCheckInAt < lastMessageAt;
}

/** Called by the scheduler on big game events (e.g. a boss spawn) to lift the mood. */
export function setOracleExtatic(): void {
  extaticUntil = Date.now() + EXTATIC_MS;
}

function pruneUserMaps(now: number): void {
  for (const state of guildOracleStates.values()) {
    for (const [id, times] of state.userMsgTimes) {
      const kept = times.filter((t) => t > now - ACTIVITY_WINDOW_MS);
      if (kept.length === 0) state.userMsgTimes.delete(id);
      else state.userMsgTimes.set(id, kept);
    }
    for (const [id, times] of state.userToxicTimes) {
      const kept = times.filter((t) => t > now - TOXICITY_WINDOW_MS);
      if (kept.length === 0) state.userToxicTimes.delete(id);
      else state.userToxicTimes.set(id, kept);
    }
    for (const [id, ts] of state.lastBlessAt) if (now - ts > BLESS_COOLDOWN_MS) state.lastBlessAt.delete(id);
    for (const [id, ts] of state.lastCurseAt) if (now - ts > CURSE_COOLDOWN_MS) state.lastCurseAt.delete(id);
    if (state.activeCheckIn && now > state.activeCheckIn.expiresAt) state.activeCheckIn = null;
  }
  pruneAllEffects();
}

function pickUsersToBless(state: GuildOracleState, now: number): string[] {
  const eligible: { id: string; count: number }[] = [];
  for (const [id, times] of state.userMsgTimes) {
    const win = times.filter((t) => t > now - ACTIVITY_WINDOW_MS);
    if (win.length < BLESS_MIN_MSGS) continue;
    if ((win[win.length - 1]! - win[0]!) < BLESS_MIN_SPAN_MS) continue;
    if (now - (state.lastBlessAt.get(id) ?? 0) < BLESS_COOLDOWN_MS) continue;
    if (recentCount(state.userToxicTimes.get(id), TOXICITY_WINDOW_MS, now) > 0) continue;
    if (recentCount(times, SPAM_WINDOW_MS, now) >= SPAM_BURST) continue; // no buffs for spam farming
    eligible.push({ id, count: win.length });
  }
  eligible.sort((a, b) => b.count - a.count);
  return eligible.slice(0, MAX_GRANTS_PER_TICK).map((e) => e.id);
}

function pickUsersToCurse(state: GuildOracleState, now: number): string[] {
  const eligible: { id: string; score: number }[] = [];
  for (const [id, times] of state.userMsgTimes) {
    if (now - (state.lastCurseAt.get(id) ?? 0) < CURSE_COOLDOWN_MS) continue;
    const tox = recentCount(state.userToxicTimes.get(id), TOXICITY_WINDOW_MS, now);
    const burst = recentCount(times, SPAM_WINDOW_MS, now);
    if (tox >= CURSE_TOXIC_HITS || burst >= SPAM_BURST) {
      eligible.push({ id, score: tox * 100 + burst });
    }
  }
  eligible.sort((a, b) => b.score - a.score);
  return eligible.slice(0, MAX_GRANTS_PER_TICK).map((e) => e.id);
}

async function getMainChannel(client: Client, channelId: string): Promise<TextChannel | null> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!(channel instanceof TextChannel) || isTicketCategoryParentId(channel.parentId, channel.guildId)) return null;
  return channel;
}

function checkInQuestion(mood: MoodState): string {
  if (mood === "somnoros" || mood === "tacut") {
    return pick([
      "Ce faceți, fii ai Cenușii? Mai veghează cineva în Regat sau au adormit străjerii?",
      "Ce lucrare tainică vă ține pașii în mișcare sub vălul acestei nopți?",
      "Ce gând vă bântuie somnul? Așezați-l aici, înainte ca umbrele să-l înghită.",
    ]);
  }
  if (mood === "iritat" || mood === "furios" || mood === "confuz") {
    return pick([
      "Ce otravă v-a tulburat sângele astăzi? Vorbiți, iar Oracolul va asculta din întuneric.",
      "Ce legământ s-a rupt în Regat? Spuneți ce vă apasă înainte ca Umbrele să afle singure.",
      "Vă aud glasurile printre cripte. Ce nenorocire se târăște acum prin ținut?",
    ]);
  }
  return pick([
    "Ce faceți sub vălul nopții, călători? Ce planuri aprindeți în cenușa zilei?",
    "Ce urzeală puneți la cale în Regat? Vorbiți; Oracolul vă ascultă.",
    "Cum vă poartă soarta, suflete ale Cenușii? Lăsați aici un semn pentru cel ce veghează.",
    "Ce v-a adus lumină sau mânie astăzi? Nicio emoție nu scapă privirii Oracolului.",
  ]);
}

function updatePresence(client: Client, mood: MoodState): void {
  if (lastPresenceMood === mood) return;
  lastPresenceMood = mood;
  const meta = MOOD_META[mood];
  try {
    client.user?.setPresence({
      status: "online",
      activities: [{ name: `Veghe: ${meta.label} în Regat`, type: ActivityType.Watching }],
    });
  } catch (err) {
    logger.warn({ err, mood }, "Oracle could not update presence");
  }
}

export function refreshOraclePresence(client: Client, guildId: string): void {
  updatePresence(client, getCurrentMood(guildId));
}

async function postMood(
  client: Client,
  channel: TextChannel,
  mood: MoodState,
  now: number,
  guildId: string,
): Promise<void> {
  const meta = MOOD_META[mood];
  let content = `${meta.emoji} *Oracolul Cenușii cheamă Regatul* — **${meta.label}**\n${checkInQuestion(mood)}`;

  if (mood === "iritat" || mood === "furios") content += `\n> ${pick(TOXICITY_REACTIONS)}`;
  else if (mood === "agitat" || mood === "extatic") content += `\n> ${pick(ACTIVITY_REACTIONS)}`;
  else if (Math.random() < PROPHECY_CHANCE) content += `\n> *${pick(PROPHECY_FLAVOR)}*`;
  content += `\n\n📝 **Însemnarea Oracolului:** starea mea este **${meta.label}**. Răspundeți sub această chemare — glasurile voastre pot schimba fața Cenușii.`;

  const sent = await channel.send({
    content,
    allowedMentions: { parse: [] },
  });
  getGuildState(guildId).activeCheckIn = {
    messageId: sent.id,
    channelId: channel.id,
    openedAt: now,
    expiresAt: now + CHECKIN_RESPONSE_WINDOW_MS,
    responders: new Set(),
    positive: 0,
    negative: 0,
    neutral: 0,
  };
  getGuildState(guildId).lastCheckInAt = now;
  updatePresence(client, mood);
}

async function runBehaviorGrants(channel: TextChannel, state: GuildOracleState, now: number): Promise<void> {
  for (const id of pickUsersToBless(state, now)) {
    const def = grantRandomBlessing(id);
    state.lastBlessAt.set(id, now);
    await channel.send({
      content: `${def.emoji} <@${id}>, Oracolul te **binecuvântează** pentru zelul tău: **${def.label}** — ${def.flavor}.`,
      allowedMentions: { users: [id] },
    }).catch(() => null);
    logger.info({ effect: def.id }, "Oracle granted blessing");
  }
  for (const id of pickUsersToCurse(state, now)) {
    const def = grantRandomCurse(id);
    state.lastCurseAt.set(id, now);
    await channel.send({
      content: `${def.emoji} <@${id}>, Oracolul aruncă un **blestem**: **${def.label}** — ${def.flavor}. *(Umbrele nu uită.)*`,
      allowedMentions: { users: [id] },
    }).catch(() => null);
    logger.info({ effect: def.id }, "Oracle granted curse");
  }
}

async function oracleTick(
  client: Client,
  channelId: string,
  guildId: string,
  runGeneration: number,
): Promise<void> {
  try {
    const state = getGuildState(guildId);
    if (!isOracleEnabled(guildId) || state.runGeneration !== runGeneration) return;
    const now = Date.now();
    pruneUserMaps(now);
    if (!CHECKIN_ENABLED) return;
    if (!isOracleCheckInDue(state.lastMessageAt, state.lastCheckInAt, now)) return;

    const channel = await getMainChannel(client, channelId);
    if (!channel) return;

    const mood = getCurrentMood(guildId);
    await postMood(client, channel, mood, now, guildId);
    await runBehaviorGrants(channel, state, now);
    logger.info(
      { mood, silentForMinutes: Math.round((now - state.lastMessageAt) / MIN) },
      "Oracle tick posted after silence",
    );
  } catch (err) {
    logger.error({ err }, "Oracle tick failed");
  } finally {
    const state = getGuildState(guildId);
    if (isOracleEnabled(guildId) && state.runGeneration === runGeneration) {
      scheduleNextTick(client, channelId, guildId, runGeneration);
    }
  }
}

function scheduleNextTick(
  client: Client,
  channelId: string,
  guildId: string,
  runGeneration: number,
): void {
  const state = getGuildState(guildId);
  if (!isOracleEnabled(guildId) || state.runGeneration !== runGeneration) return;
  const regularDelay = MIN_TICK_MS + Math.floor(Math.random() * (MAX_TICK_MS - MIN_TICK_MS + 1));
  const silenceDueAt = state.lastMessageAt + CHECKIN_SILENCE_MS;
  const waitingForSilence =
    state.lastMessageAt > 0 && state.lastCheckInAt < state.lastMessageAt && silenceDueAt > Date.now();
  const delay = waitingForSilence ? Math.max(1_000, silenceDueAt - Date.now()) : regularDelay;
  const t = setTimeout(() => {
    void oracleTick(client, channelId, guildId, runGeneration);
  }, delay);
  t.unref?.();
}

export function startOracle(client: Client, channelId: string, guildId = DEFAULT_GUILD_ID): void {
  if (!isOracleEnabled(guildId) || !CHECKIN_ENABLED) {
    if (!CHECKIN_ENABLED) {
      logger.info({ guildId }, "Oracle proactive mood check-ins are disabled");
    }
    return;
  }
  const state = getGuildState(guildId);
  if (state.running) return;
  state.running = true;
  state.runGeneration += 1;
  const runGeneration = state.runGeneration;
  if (!MESSAGE_CONTENT_ENABLED) {
    logger.warn(
      "Oracle toxicity detection is OFF. To enable curses from toxic chat, turn on the 'Message Content Intent' in the Discord Developer Portal and set ORACLE_MESSAGE_CONTENT_ENABLED=true.",
    );
  }
  const t = setTimeout(() => {
    void oracleTick(client, channelId, guildId, runGeneration);
  }, FIRST_TICK_MS);
  t.unref?.();
  logger.info({ contentIntent: MESSAGE_CONTENT_ENABLED }, "Oracle mood system started");
}
