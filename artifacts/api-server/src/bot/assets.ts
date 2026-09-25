function publicBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev.trim()}`;
  return "";
}

const BASE = publicBaseUrl();

function assetUrl(file: string): string | null {
  return BASE ? `${BASE}/api/assets/${file}` : null;
}

export const IMG = {
  monster: assetUrl("monster_14.png"),
  dragon: assetUrl("dragon.gif"),
  chest: assetUrl("chest.gif"),
  death: assetUrl("death.gif"),
  trader: assetUrl("trader2.gif"),
  shop: assetUrl("shop2.gif"),
  ticketSeal: assetUrl("ticket_seal.png"),
};

/**
 * Per-monster art — index i matches MONSTERS[i] in survival.ts.
 * All rarities use the static v2 PNG portraits (user-provided art; the animated
 * rarity GIFs were retired — they rendered poorly in Discord). Bosses never use
 * these — they have their own art via bossImg().
 */
export function monsterImg(index: number, _rarity: string): string | null {
  const n = String(index + 1).padStart(2, "0");
  return assetUrl(`monster_${n}_v2.png`);
}

/** Static v2 portrait per named boss — index i matches BOSSES[i] in survival.ts. Used for mini-boss fights and the final boss embed. */
export function bossImg(index: number): string | null {
  return assetUrl(`boss_${String(index + 1).padStart(2, "0")}_v2.png`);
}

/** One image per named monster — index i matches MONSTERS[i] in survival.ts. */
export const MONSTER_IMG: (string | null)[] = Array.from({ length: 14 }, (_, i) =>
  assetUrl(`monster_${String(i + 1).padStart(2, "0")}_v2.png`),
);

export const CHEST_IMG: Record<string, string | null> = {
  bronz:  assetUrl("chest_stins.png"),
  argint: assetUrl("chest_cenusii.png"),
  aur:    assetUrl("chest_nocturn.png"),
  mitic:  assetUrl("chest_oaselor.png"),
  regal:  assetUrl("chest_fumului.png"),
  cavaler: assetUrl("chest_cavalerului.png"),
};

export const KEY_IMG: Record<string, string | null> = {
  rar: assetUrl("key_umbrei_frante.png"),
  epic: assetUrl("key_cenusii_regale.png"),
  regal: assetUrl("key_nocturna.png"),
  oase: assetUrl("key_oaselor_tacute.png"),
  fum: assetUrl("key_fumului_inghetat.png"),
  cavaler: assetUrl("key_cavalerului_cenusi.png"),
};

export const CLASS_IMG: Record<string, string | null> = {
  alchimist: assetUrl("class_alchimistul.png"),
  cavaler: assetUrl("class_cavaler.png"),
  ratacitor: assetUrl("class_ratacitor.png"),
  strajer: assetUrl("class_strajerul.png"),
  umbrolog: assetUrl("class_umbrologul.png"),
};

export const EQUIPMENT_IMG: Record<string, string | null> = {
  sabia_regelui: assetUrl("arma-sabia-regelui.png"),
  pumnalul_umbrei: assetUrl("arma-pumnalul-umbrei.png"),
  ciocanul_de_jar: assetUrl("arma-ciocanul-de-jar.png"),
  arcul_vanatorului: assetUrl("arma-arcul-vanatorului.png"),
  catalizatorul_coroziv: assetUrl("arma-catalizatorul-coroziv.png"),
  platosa_cenusie: assetUrl("armura-platosa-cenusie.png"),
  mantia_fantomei: assetUrl("armura-mantia-fantomei.png"),
  cuirasa_veghei: assetUrl("armura-cuirasa-veghei.png"),
  halatul_reagentului: assetUrl("armura-halatul-reagentului.png"),
  pelerina_de_fum: assetUrl("armura-pelerina-de-fum.png"),
};

export const CHEST_WORLD_IMG = {
  personal: assetUrl("chest_veghea_zilnica.png"),
  fratie: assetUrl("chivot_fratia.png"),
  corruptedKey: assetUrl("key_pangarita.png"),
  eclipse: assetUrl("chest_eclipsa_neagra.png"),
  queen: assetUrl("chest_regina_moarta.png"),
  solstice: assetUrl("chest_solstitiul_sangeros.png"),
  carnival: assetUrl("chest_carnavalul_funebru.png"),
  auction: assetUrl("trader_targul_negru.png"),
  oracle: assetUrl("chest_soaptele_oracolului.png"),
} as const;

export const COMPANION_IMG: Record<string, { base: string | null; evo: string | null }> = {
  lup: { base: assetUrl("companion_lup_anim.gif"), evo: assetUrl("companion_lup_evo_anim.gif") },
  corb: { base: assetUrl("companion_corb_anim.gif"), evo: assetUrl("companion_corb_evo_anim.gif") },
  spirit: { base: assetUrl("companion_spirit_anim.gif"), evo: assetUrl("companion_spirit_evo_anim.gif") },
  golem: { base: assetUrl("companion_golem_anim.gif"), evo: assetUrl("companion_golem_evo_anim.gif") },
};
