// In-memory, per-player temporary buffs (blessings) and debuffs (curses) the
// Oracle grants based on behavior. Ephemeral by design: they last minutes and
// reset on restart, mirroring combat-events.ts. Combat and reward code read them
// LIVE (by discordId, at attack/reward time) via getCombatModifiers /
// getRewardMultipliers, so an effect granted mid-event applies immediately
// without mutating the event_participants snapshot.

export type EffectKind = "blessing" | "curse";

export type EffectMods = {
  /** Flat +/- to crit chance, in percentage points. */
  critAdd?: number;
  /** Multiplier on damage dealt (e.g. 1.1 = +10%, 0.9 = -10%). */
  damageMult?: number;
  /** Multiplier on damage received (e.g. 0.85 = takes less, 1.15 = takes more). */
  damageTakenMult?: number;
  /** Multiplier on XP rewards. */
  xpMult?: number;
  /** Multiplier on Oboli rewards. */
  goldMult?: number;
};

export type EffectDef = {
  id: string;
  kind: EffectKind;
  label: string;
  emoji: string;
  /** Short Romanian description of the mechanical effect. */
  flavor: string;
  durationMs: number;
  mods: EffectMods;
};

const MIN = 60 * 1000;

export const BLESSINGS: EffectDef[] = [
  { id: "lumina_cenusii",      kind: "blessing", label: "Lumina Cenușii",       emoji: "✨", flavor: "+10% XP în luptă",            durationMs: 10 * MIN, mods: { xpMult: 1.1 } },
  { id: "ochiul_oracolului",   kind: "blessing", label: "Ochiul Oracolului",    emoji: "🔮", flavor: "+15% șansă de lovitură critică", durationMs: 10 * MIN, mods: { critAdd: 15 } },
  { id: "pasul_umbrelor",      kind: "blessing", label: "Pasul Umbrelor",       emoji: "💨", flavor: "+10% daune în luptă",        durationMs: 10 * MIN, mods: { damageMult: 1.1 } },
  { id: "respiratia_regatului",kind: "blessing", label: "Respirația Regatului", emoji: "🍃", flavor: "+10% Oboli în luptă",        durationMs: 10 * MIN, mods: { goldMult: 1.1 } },
  { id: "spiritul_protector",  kind: "blessing", label: "Spiritul Protector",   emoji: "🛡️", flavor: "primești cu 15% mai puține daune", durationMs: 10 * MIN, mods: { damageTakenMult: 0.85 } },
  { id: "cenusa_vie",          kind: "blessing", label: "Cenușa Vie",           emoji: "🔥", flavor: "+15% daune și +10% XP",      durationMs: 10 * MIN, mods: { damageMult: 1.15, xpMult: 1.1 } },
];

export const CURSES: EffectDef[] = [
  { id: "ghinionul_umbrelor", kind: "curse", label: "Ghinionul Umbrelor",  emoji: "🌑", flavor: "-10% Oboli în luptă",            durationMs: 8 * MIN, mods: { goldMult: 0.9 } },
  { id: "degetele_tremurande",kind: "curse", label: "Degetele Tremurânde", emoji: "🥶", flavor: "-10% șansă de lovitură critică", durationMs: 8 * MIN, mods: { critAdd: -10 } },
  { id: "umbra_schioapa",     kind: "curse", label: "Umbra Șchioapă",      emoji: "🦶", flavor: "-10% daune în luptă",            durationMs: 8 * MIN, mods: { damageMult: 0.9 } },
  { id: "limba_cenusii",      kind: "curse", label: "Limba Cenușii",       emoji: "👅", flavor: "primești cu 15% mai multe daune", durationMs: 8 * MIN, mods: { damageTakenMult: 1.15 } },
  { id: "capul_in_nori",      kind: "curse", label: "Capul în Nori",       emoji: "🌫️", flavor: "-10% XP în luptă",               durationMs: 8 * MIN, mods: { xpMult: 0.9 } },
];

type ActiveEffect = { def: EffectDef; expiresAt: number };

const store = new Map<string, ActiveEffect[]>();
const MAX_EFFECTS_PER_USER = 4;

function pruned(discordId: string): ActiveEffect[] {
  const now = Date.now();
  const list = (store.get(discordId) ?? []).filter((e) => e.expiresAt > now);
  if (list.length === 0) store.delete(discordId);
  else store.set(discordId, list);
  return list;
}

/** Grants a specific effect to a player, refreshing it if already active. */
export function grantEffect(discordId: string, def: EffectDef): ActiveEffect {
  const list = pruned(discordId).filter((e) => e.def.id !== def.id);
  const eff: ActiveEffect = { def, expiresAt: Date.now() + def.durationMs };
  list.push(eff);
  // Keep only the most-recent effects so buffs/curses can't stack unbounded.
  store.set(discordId, list.slice(-MAX_EFFECTS_PER_USER));
  return eff;
}

export function grantRandomBlessing(discordId: string): EffectDef {
  const def = BLESSINGS[Math.floor(Math.random() * BLESSINGS.length)]!;
  grantEffect(discordId, def);
  return def;
}

export function grantRandomCurse(discordId: string): EffectDef {
  const def = CURSES[Math.floor(Math.random() * CURSES.length)]!;
  grantEffect(discordId, def);
  return def;
}

// ─── Chest blessings & curses ────────────────────────────────────────────────
// Opening a chest can unleash a blessing or a curse that applies immediately
// (live-read in combat/rewards). Higher rarities are more likely to bless.

export type ChestEffectOdds = { chance: number; blessingShare: number };

export const CHEST_EFFECT_ODDS: Record<string, ChestEffectOdds> = {
  bronz:  { chance: 0.22, blessingShare: 0.55 },
  argint: { chance: 0.30, blessingShare: 0.65 },
  aur:    { chance: 0.40, blessingShare: 0.80 },
  mitic:  { chance: 0.60, blessingShare: 0.90 },
  regal:  { chance: 0.80, blessingShare: 1.0 },
};

// Locked chests cost a key, so they never curse — only bless (Regal: guaranteed).
export const LOCKED_CHEST_EFFECT_ODDS: Record<string, ChestEffectOdds> = {
  argint: { chance: 0.50, blessingShare: 1.0 },
  aur:    { chance: 0.75, blessingShare: 1.0 },
  regal:  { chance: 1.0,  blessingShare: 1.0 },
};

/**
 * Rolls whether a chest of the given rarity unleashes an effect.
 * Returns "blessing", "curse", or null (no effect).
 */
export function rollChestEffectKind(rarityKey: string, locked = false): EffectKind | null {
  const odds = (locked ? LOCKED_CHEST_EFFECT_ODDS : CHEST_EFFECT_ODDS)[rarityKey];
  if (!odds) return null;
  if (Math.random() >= odds.chance) return null;
  return Math.random() < odds.blessingShare ? "blessing" : "curse";
}

/** Dramatic Romanian announcement for a chest-granted effect. */
export function buildChestEffectMessage(username: string, def: EffectDef): string {
  const mins = Math.max(1, Math.round(def.durationMs / MIN));
  const minsLabel = mins === 1 ? "1 minut" : `${mins} minute`;
  if (def.kind === "blessing") {
    return (
      `🔮✨ Din cufăr se ridică o lumină blândă…\n` +
      `${def.emoji} **${username}** primește binecuvântarea **${def.label}**!\n` +
      `➕ ${def.flavor} *(activă ${minsLabel})*`
    );
  }
  return (
    `🔮🌑 Din cufăr țâșnește un fum negru…\n` +
    `${def.emoji} **${username}** e lovit de blestemul **${def.label}**!\n` +
    `➖ ${def.flavor} *(durează ${minsLabel})*`
  );
}

export function getActiveEffects(discordId: string): { def: EffectDef; msLeft: number }[] {
  const now = Date.now();
  return pruned(discordId).map((e) => ({ def: e.def, msLeft: e.expiresAt - now }));
}

export type CombatModifiers = { critAdd: number; damageMult: number; damageTakenMult: number };

export function getCombatModifiers(discordId: string): CombatModifiers {
  const mods: CombatModifiers = { critAdd: 0, damageMult: 1, damageTakenMult: 1 };
  for (const { def } of pruned(discordId)) {
    if (def.mods.critAdd) mods.critAdd += def.mods.critAdd;
    if (def.mods.damageMult) mods.damageMult *= def.mods.damageMult;
    if (def.mods.damageTakenMult) mods.damageTakenMult *= def.mods.damageTakenMult;
  }
  return mods;
}

export type RewardMultipliers = { xpMult: number; goldMult: number };

// ─── Guild-level admin boosts ─────────────────────────────────────────────────

export type GuildBoost = { xpMult: number; goldMult: number; expiresAt: number };
const guildBoostStore = new Map<string, GuildBoost>();

export function grantGuildBoost(guildId: string, xpMult: number, goldMult: number, durationMs: number): GuildBoost {
  const boost: GuildBoost = { xpMult, goldMult, expiresAt: Date.now() + durationMs };
  guildBoostStore.set(guildId, boost);
  return boost;
}

/** Restores a guild boost whose absolute expiry was persisted elsewhere. */
export function restoreGuildBoost(
  guildId: string,
  xpMult: number,
  goldMult: number,
  expiresAt: number,
): GuildBoost | null {
  if (
    !Number.isFinite(xpMult) ||
    xpMult <= 0 ||
    !Number.isFinite(goldMult) ||
    goldMult <= 0 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return null;
  }
  const boost: GuildBoost = { xpMult, goldMult, expiresAt };
  guildBoostStore.set(guildId, boost);
  return boost;
}

export function getGuildBoost(guildId: string): GuildBoost | null {
  const b = guildBoostStore.get(guildId);
  if (!b || b.expiresAt <= Date.now()) { guildBoostStore.delete(guildId); return null; }
  return b;
}

export function clearGuildBoost(guildId: string): void { guildBoostStore.delete(guildId); }

export function grantAdminPlayerBoost(discordId: string, xpMult: number, goldMult: number, durationMs: number): ActiveEffect {
  const parts: string[] = [];
  if (xpMult > 1) parts.push(`+${Math.round((xpMult - 1) * 100)}% XP`);
  if (goldMult > 1) parts.push(`+${Math.round((goldMult - 1) * 100)}% Oboli`);
  const def: EffectDef = {
    id: "admin_boost",
    kind: "blessing",
    label: "Bonus Admin",
    emoji: "⚡",
    flavor: parts.join(", ") || "boost activ",
    durationMs,
    mods: { xpMult: xpMult > 1 ? xpMult : undefined, goldMult: goldMult > 1 ? goldMult : undefined },
  };
  return grantEffect(discordId, def);
}

// ─── Reward multipliers (player effects + optional guild boost) ───────────────

export function getRewardMultipliers(discordId: string, guildId?: string): RewardMultipliers {
  const mult: RewardMultipliers = { xpMult: 1, goldMult: 1 };
  for (const { def } of pruned(discordId)) {
    if (def.mods.xpMult) mult.xpMult *= def.mods.xpMult;
    if (def.mods.goldMult) mult.goldMult *= def.mods.goldMult;
  }
  if (guildId) {
    const gb = getGuildBoost(guildId);
    if (gb) { mult.xpMult *= gb.xpMult; mult.goldMult *= gb.goldMult; }
  }
  return mult;
}

/** Drops expired effects for every tracked user — cheap periodic hygiene. */
export function pruneAllEffects(): void {
  for (const id of [...store.keys()]) pruned(id);
}

/**
 * Removes all active curses from a player (blessings are left untouched).
 * Returns the number of curses that were removed.
 */
export function clearCurses(discordId: string): number {
  const list = pruned(discordId);
  const remaining = list.filter((e) => e.def.kind !== "curse");
  const removed = list.length - remaining.length;
  if (remaining.length === 0) store.delete(discordId);
  else store.set(discordId, remaining);
  return removed;
}

/** Renders active effects for the profile embed, or "" when there are none. */
export function formatActiveEffects(discordId: string): string {
  const active = getActiveEffects(discordId);
  if (active.length === 0) return "";
  return active
    .map(({ def, msLeft }) => {
      const min = Math.max(1, Math.round(msLeft / MIN));
      return `${def.emoji} **${def.label}** — ${def.flavor} *(${min}m)*`;
    })
    .join("\n");
}

/** Turns an effect's mods into explicit "+X% / -X%" parts (what goes up, what goes down). */
export function describeEffectMods(mods: EffectMods): string {
  const pct = (mult: number) => `${mult >= 1 ? "+" : "-"}${Math.round(Math.abs(mult - 1) * 100)}%`;
  const parts: string[] = [];
  if (mods.damageMult != null && mods.damageMult !== 1) parts.push(`${pct(mods.damageMult)} daune`);
  if (mods.critAdd != null && mods.critAdd !== 0) parts.push(`${mods.critAdd > 0 ? "+" : ""}${mods.critAdd}% șansă critică`);
  if (mods.damageTakenMult != null && mods.damageTakenMult !== 1) {
    parts.push(`${pct(mods.damageTakenMult)} daune primite`);
  }
  if (mods.xpMult != null && mods.xpMult !== 1) parts.push(`${pct(mods.xpMult)} XP`);
  if (mods.goldMult != null && mods.goldMult !== 1) parts.push(`${pct(mods.goldMult)} Oboli`);
  return parts.join(", ");
}

/**
 * Compact per-round effect display for the combat embed: green/red dot per
 * blessing/curse, plus the exact bonuses/penalties and time left.
 * Returns "" when the player has no active effects.
 */
export function formatCombatEffects(discordId: string): string {
  const active = getActiveEffects(discordId);
  if (active.length === 0) return "";
  return active
    .map(({ def, msLeft }) => {
      const min = Math.max(1, Math.round(msLeft / MIN));
      const dot = def.kind === "blessing" ? "🟢" : "🔴";
      const desc = describeEffectMods(def.mods) || def.flavor;
      return `${dot} ${def.emoji} **${def.label}** — ${desc} *(${min}m)*`;
    })
    .join("\n");
}
