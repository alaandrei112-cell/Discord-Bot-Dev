// In-memory global "battle events" that affect every fighter while active.
// Ephemeral by design: they last seconds/minutes and reset on restart.

export type BattleEventKey = "explozie" | "umbre" | "furtuna";

export type BattleEvent = {
  key: BattleEventKey;
  emoji: string;
  title: string;
  announce: string;
  /** Multiplier applied to player damage (e.g. 1.1 = +10%). */
  damageMult: number;
  /** Flat reduction of monster hit chance, in percent. */
  monsterMissBonus: number;
  /** One-time HP drained from each fighter's next attack. */
  hpDrain: number;
  expiresAt: number;
};

const POOL: Omit<BattleEvent, "expiresAt">[] = [
  {
    key: "explozie",
    emoji: "💥",
    title: "Explozie de Cenușă",
    announce:
      "💥 **EXPLOZIE DE CENUȘĂ!** 💥\nO undă de putere mătură Regatul — loviturile voastre ard mai tare!\n*(+10% daune timp de 1 minut)*",
    damageMult: 1.1,
    monsterMissBonus: 0,
    hpDrain: 0,
  },
  {
    key: "umbre",
    emoji: "🌫️",
    title: "Umbre Instabile",
    announce:
      "🌫️ **UMBRE INSTABILE!** 🌫️\nCreaturile se clatină în ceață și lovesc orbește.\n*(monștrii ratează mai des timp de 30 de secunde)*",
    damageMult: 1,
    monsterMissBonus: 20,
    hpDrain: 0,
  },
  {
    key: "furtuna",
    emoji: "🌪️",
    title: "Furtună de Fum",
    announce:
      "🌪️ **FURTUNĂ DE FUM!** 🌪️\nUn vârtej de cenușă arzătoare trece prin Regat.\n*(pierzi 5 HP la următoarea lovitură)*",
    damageMult: 1,
    monsterMissBonus: 0,
    hpDrain: 5,
  },
];

const DURATION: Record<BattleEventKey, number> = {
  explozie: 60 * 1000,
  umbre: 30 * 1000,
  furtuna: 45 * 1000,
};

let active: BattleEvent | null = null;
const stormApplied = new Set<string>();

export function getActiveBattleEvent(): BattleEvent | null {
  if (active && active.expiresAt > Date.now()) return active;
  active = null;
  return null;
}

/** Picks a random battle event, activates it, and returns it for announcing. */
export function triggerRandomBattleEvent(): BattleEvent {
  const base = POOL[Math.floor(Math.random() * POOL.length)]!;
  active = { ...base, expiresAt: Date.now() + DURATION[base.key] };
  if (base.key === "furtuna") stormApplied.clear();
  return active;
}

/**
 * Returns the HP a fighter should lose to the active smoke storm on this
 * attack, then marks them so the storm only hits each fighter once.
 */
export function consumeStormDrain(eventId: number, discordId: string): number {
  const ev = getActiveBattleEvent();
  if (!ev || ev.hpDrain <= 0) return 0;
  const key = `${eventId}:${discordId}`;
  if (stormApplied.has(key)) return 0;
  stormApplied.add(key);
  return ev.hpDrain;
}
