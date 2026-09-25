import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";

export type EventType = "loot" | "encounter" | "quest" | "ritual";

export type Reward = {
  xp: number;
  gold: number;
  reputation: number;
  hpChange: number;
  message: string;
};

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcLootRewards(): Reward {
  const roll = Math.random();
  if (roll < 0.01) {
    return { xp: 500, gold: 500, reputation: 10, hpChange: 0, message: "✨ **LEGENDAR!** Ai găsit *Sceptrul Cenușii*! +500 XP, +500 🪙" };
  } else if (roll < 0.2) {
    return { xp: 150, gold: 100, reputation: 5, hpChange: 0, message: "💜 **Rar!** Un artefact vechi se dezvăluie! +150 XP, +100 🪙" };
  } else {
    return { xp: rand(10, 50), gold: rand(10, 60), reputation: 0, hpChange: 0, message: `🟫 Ai deschis cufărul! +${rand(10,50)} XP, +${rand(10,60)} 🪙` };
  }
}

function calcEncounterRewards(): Reward {
  const roll = Math.random();
  if (roll < 0.1) {
    return { xp: rand(5, 20), gold: 0, reputation: 0, hpChange: -rand(10, 30), message: `💀 Creatura te-a rănit! -${rand(10,30)} ❤️, +${rand(5,20)} XP` };
  } else if (roll < 0.3) {
    return { xp: 200, gold: 150, reputation: 0, hpChange: 0, message: "⚡ **CRITIC!** Creatura fuge și lasă prada! +200 XP, +150 🪙" };
  } else {
    return { xp: rand(20, 80), gold: 0, reputation: rand(5, 15), hpChange: 0, message: `⚔️ Ai respins creatura! +${rand(20,80)} XP, +${rand(5,15)} Reputație` };
  }
}

function calcQuestRewards(): Reward {
  const roll = Math.random();
  const base = { xp: rand(15, 60), gold: rand(5, 30), reputation: rand(10, 25), hpChange: 0 };
  if (roll < 0.1) {
    return { ...base, hpChange: 50, message: `🌟 **Binecuvântare!** Străjerul te-a binecuvântat! +${base.xp} XP, +${base.reputation} Rep, +50 ❤️` };
  } else {
    return { ...base, message: `🛡️ Ai salvat străjerul! +${base.xp} XP, +${base.reputation} Rep, +${base.gold} 🪙` };
  }
}

function calcRitualRewards(): Reward {
  const roll = Math.random();
  if (roll < 0.30) {
    return { xp: 100, gold: 0, reputation: 20, hpChange: 0, message: "✨ **Binecuvântare!** Cenușa te-a ales! +100 XP, +20 Reputație" };
  } else if (roll < 0.60) {
    return { xp: 0, gold: -20, reputation: 0, hpChange: -20, message: "💀 **Blestem!** Ritualul te-a pedepsit! -20 ❤️, -20 🪙" };
  } else if (roll < 0.85) {
    return { xp: 75, gold: 0, reputation: 10, hpChange: 0, message: "🔥 **Cenușă Sacră!** Puterea se trezeşte în tine! +75 XP, +10 Rep" };
  } else {
    return { xp: 300, gold: 200, reputation: 30, hpChange: 0, message: "🌀 **PORTAL!** Un eveniment special s-a deschis! +300 XP, +200 🪙, +30 Rep" };
  }
}

export type EventDef = {
  type: EventType;
  title: string;
  description: string;
  buttonLabel: string;
  buttonEmoji: string;
  color: number;
  calcRewards: () => Reward;
};

export const EVENT_DEFS: Record<EventType, EventDef> = {
  loot: {
    type: "loot",
    title: "🎁 Cufărul Cenușii a fost găsit!",
    description:
      "O cutie veche, acoperită de cenușă fierbinte, se materializează în fața ta.\nSe spune că doar cei curajoși o pot deschide fără să fie arși…",
    buttonLabel: "Deschide Cufărul",
    buttonEmoji: "🎁",
    color: 0x8b4513,
    calcRewards: calcLootRewards,
  },
  encounter: {
    type: "encounter",
    title: "👁️ O Creatură din Umbre te atacă!",
    description:
      "Din întunericul dens, o siluetă se desprinde și se aruncă spre tine.\nUmbrele șoptesc numele tău… vei riposta?",
    buttonLabel: "Atacă",
    buttonEmoji: "🗡️",
    color: 0x4b0082,
    calcRewards: calcEncounterRewards,
  },
  quest: {
    type: "quest",
    title: "🛡️ Ajută Străjerul Rănit",
    description:
      "Un străjer al Regatului, acoperit de cenușă și sânge, îți cere ajutorul.\nPoți interveni sau îl poți lăsa pradă Umbrelor…",
    buttonLabel: "Ajută",
    buttonEmoji: "🛡️",
    color: 0x1e3a5f,
    calcRewards: calcQuestRewards,
  },
  ritual: {
    type: "ritual",
    title: "🔥 Ritualul Cenușii se Deschide",
    description:
      "Cenușa se ridică în spirale, formând simboluri vechi.\nUmbrele îți oferă o alegere… dar prețul poate fi mare.",
    buttonLabel: "Invocă",
    buttonEmoji: "🔥",
    color: 0x8a4a2f,
    calcRewards: calcRitualRewards,
  },
};

export const EVENT_TYPES: EventType[] = ["loot", "encounter", "quest", "ritual"];

export function randomEventType(): EventType {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]!;
}

export function buildEventEmbed(def: EventDef): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(def.color)
    .setTitle(def.title)
    .setDescription(def.description)
    .setFooter({ text: "⏳ Eveniment activ timp de 1 oră." })
    .setTimestamp();
}

export function buildEventRow(eventId: number, def: EventDef): ActionRowBuilder<ButtonBuilder> {
  const btn = new ButtonBuilder()
    .setCustomId(`event_${eventId}`)
    .setLabel(def.buttonLabel)
    .setEmoji(def.buttonEmoji)
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

export function buildExpiredEmbed(def: EventDef): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x555555)
    .setTitle(`~~${def.title}~~`)
    .setDescription("*Evenimentul s-a încheiat. Cenușa s-a risipit…*")
    .setFooter({ text: "⌛ Eveniment expirat." });
}
