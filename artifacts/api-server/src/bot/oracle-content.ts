// Romanian flavor text banks for the Oracle mood system. Pure data — no logic.
// The Oracle ("Oracolul Cenușii") reacts to server activity by posting one of
// these lines in the main channel, sometimes tagging an active player.

export type MoodState =
  | "calm"
  | "agitat"
  | "somnoros"
  | "iritat"
  | "furios"
  | "extatic"
  | "confuz"
  | "tacut";

export const MOOD_META: Record<MoodState, { label: string; emoji: string }> = {
  calm:     { label: "Calm",     emoji: "🌙" },
  agitat:   { label: "Agitat",   emoji: "⚡" },
  somnoros: { label: "Somnoros", emoji: "😴" },
  iritat:   { label: "Iritat",   emoji: "😠" },
  furios:   { label: "Furios",   emoji: "🔥" },
  extatic:  { label: "Extatic",  emoji: "🌟" },
  confuz:   { label: "Confuz",   emoji: "🌀" },
  tacut:    { label: "Tăcut",    emoji: "🤫" },
};

export const MOOD_MESSAGES: Record<MoodState, string[]> = {
  calm: [
    "Cenușa respiră liniștit… echilibrul e stabil.",
    "Oracolul observă în tăcere.",
    "Regatul se mișcă într-un ritm blând.",
    "Umbrele privesc, dar nu atacă.",
    "Totul este în armonie.",
    "Spiritele sunt liniștite.",
    "Oracolul își odihnește privirea asupra Regatului.",
  ],
  agitat: [
    "Cenușa se aprinde! Activitatea voastră trezește spiritele.",
    "Oracolul simte mișcare intensă.",
    "Regatul vibrează… ceva se pregătește.",
    "Umbrele se retrag, lumina crește.",
    "Un val de energie străbate Regatul.",
    "Spiritele dansează în jurul vostru.",
    "Oracolul privește cu interes.",
  ],
  somnoros: [
    "Regatul adoarme… Umbrele se apropie.",
    "Cenușa se răcește.",
    "Oracolul nu vede mișcare.",
    "Tăcerea apasă peste Regat.",
    "Umbrele câștigă teren.",
    "Spiritele se sting.",
    "Un calm neliniștitor domină Regatul.",
  ],
  iritat: [
    "Umbrele șoptesc cuvinte grele…",
    "Oracolul nu apreciază haosul.",
    "Cuvintele întunecate trezesc mânia Cenușii.",
    "Un suflet a tulburat echilibrul.",
    "Regatul se închide în sine.",
    "Spiritele se agită.",
    "Umbrele se hrănesc cu ceartă.",
  ],
  furios: [
    "Oracolul strigă în tăcere.",
    "Cenușa se înnegrește.",
    "Umbrele atacă fără milă.",
    "Regatul tremură.",
    "Un suflet a provocat mânia Oracolului.",
    "Spiritele se dezlănțuie.",
    "Echilibrul este rupt.",
  ],
  extatic: [
    "Lumina Cenușii explodează!",
    "Oracolul este încântat.",
    "Regatul strălucește.",
    "Umbrele fug.",
    "Spiritele cântă.",
    "O energie pură umple Regatul.",
    "Oracolul binecuvântează sufletele.",
  ],
  confuz: [
    "Oracolul nu înțelege tiparele…",
    "Regatul se mișcă ciudat.",
    "Umbrele sunt indecise.",
    "Cenușa tremură fără direcție.",
  ],
  tacut: [
    "Oracolul nu are cuvinte.",
    "Regatul tace.",
    "Umbrele ascultă.",
    "Cenușa așteaptă.",
  ],
};

// Lines used when the Oracle reacts to a burst of general activity.
export const ACTIVITY_REACTIONS: string[] = [
  "Un suflet aprins a trezit Oracolul.",
  "Activitatea voastră hrănește Cenușa.",
  "Regatul vibrează de viață.",
  "Umbrele se retrag în fața mișcării.",
  "Spiritele dansează printre voi.",
  "O energie puternică se simte în Regat.",
  "Oracolul privește cu interes crescând.",
  "Cenușa se aprinde din nou.",
  "Regatul se trezește.",
  "Cineva a atras atenția Oracolului.",
];

// Lines used when the Oracle reacts to toxic / heated chatter.
export const TOXICITY_REACTIONS: string[] = [
  "Umbrele se hrănesc cu ceartă.",
  "Cuvintele grele trezesc mânia Oracolului.",
  "Regatul se închide în sine.",
  "Cenușa se înnegrește de la atâta venin.",
  "Un suflet a tulburat echilibrul.",
  "Spiritele se agită neliniștite.",
  "Oracolul nu apreciază haosul.",
  "Umbrele râd în întuneric.",
  "Echilibrul este rupt.",
  "Un blestem se pregătește în tăcere.",
];

// Lines used when the Oracle singles out an active player (the player is tagged
// before the line). Keep them addressed to a single soul.
export const ACTIVE_PLAYER_REACTIONS: string[] = [
  "un suflet a fost remarcat de Oracol.",
  "Oracolul observă prezența ta puternică.",
  "activitatea ta aprinde Cenușa.",
  "Umbrele te urmăresc cu atenție.",
  "Regatul simte energia ta.",
  "Spiritele te privesc cu interes.",
  "o chemare se apropie de tine.",
  "Oracolul îți pregătește o încercare.",
  "Cenușa te recunoaște.",
  "un destin se țese în jurul tău.",
];

// Occasional standalone "prophecy" flavor lines. Purely cosmetic — there is no
// prophecy mechanic behind them.
export const PROPHECY_FLAVOR: string[] = [
  "Cel ce arde azi va lumina mâine.",
  "Din cenușă se naște puterea.",
  "Umbrele cad înaintea celor curajoși.",
  "Un suflet tăcut ascunde cea mai mare flacără.",
  "Cine cade în Umbre se ridică din Cenușă.",
  "Regatul răsplătește răbdarea.",
  "Lumina urmează mereu întunericului.",
  "Cel grăbit pierde drumul prin fum.",
  "O cheie uitată deschide o soartă nouă.",
  "Focul împărtășit nu se stinge niciodată.",
  "Cel ce ajută va fi ajutat de spirite.",
  "Mânia hrănește Umbrele, calmul hrănește Cenușa.",
  "Un nume rostit cu respect ajunge la Oracol.",
  "Cele mai vechi flăcări ard cel mai liniștit.",
  "Norocul vine la cei ce nu îl cer.",
  "Tăcerea Regatului prevestește o furtună.",
  "Cel ce râde în Umbre va plânge în Cenușă.",
  "O faptă mică schimbă o soartă mare.",
  "Spiritele țin minte fiecare alegere.",
  "Cenușa de azi este focul de mâine.",
];
