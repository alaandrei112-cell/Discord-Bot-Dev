export const DISCORD_INVITE = "https://discord.gg/regatulcenusii";

export const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export const factions = [
  { name: "Veghetorii Nordului", mark: "V", color: "ember", copy: "Jură să apere zidurile atunci când ceața coboară peste trecători.", detail: "DISCIPLINĂ · HOTAR" },
  { name: "Cronicarii de Sare", mark: "S", color: "gold", copy: "Adună povești, schimbă secrete și cunosc numele tuturor relicvelor.", detail: "MEMORIE · TAINĂ" },
  { name: "Fiii Fumului", mark: "F", color: "violet", copy: "Caută puterea în locurile pe care ceilalți le-au lăsat să ardă.", detail: "RISC · TRANSFORMARE" },
];

export const champions = [
  { rank: "01", name: "Aurelia Vânt-de-Sare", title: "Căpitană a Veghetorilor", score: "2.841 XP", tone: "ember" },
  { rank: "02", name: "Dorian din Turnul Gol", title: "Arhivar al Cronicarilor", score: "2.517 XP", tone: "gold" },
  { rank: "03", name: "Mara Cenușie", title: "Vânătoare de relicve", score: "2.306 XP", tone: "violet" },
];

export const events = [
  { date: "JOI · 21:00", name: "Chemarea din Mlaștină", status: "urmează", copy: "O creatură veche s-a trezit. Toate săbiile sunt chemate la marginea regatului." },
  { date: "SÂMBĂTĂ · 20:30", name: "Turnirul celor Nouă", status: "înscrieri", copy: "Dueluri scurte, mize mari și un singur nume gravat în piatra arenei." },
  { date: "DUMINICĂ · 19:00", name: "Tavernă deschisă", status: "recurring", copy: "Povești din săptămână, muzică și planuri pentru următoarea aventură." },
];

export const realmFeatures = [
  { number: "I", eyebrow: "Lupte live", title: "Ora Umbrelor", body: "Monștri, dueluri și primejdii care se nasc în timp real. Intră în luptă când chemarea se aude.", tone: "ember", icon: "sword" },
  { number: "II", eyebrow: "Progresie", title: "Forja celor vii", body: "Construiește-ți eroul, rafinează-ți echipamentul și fă ca fiecare victorie să lase urme.", tone: "gold", icon: "anvil" },
  { number: "III", eyebrow: "Recompense", title: "Cuferele Cenușii", body: "Chei, relicve și resurse pentru cei care au răbdarea să caute în ruine.", tone: "violet", icon: "chest" },
  { number: "IV", eyebrow: "Vocea regatului", title: "Oracolul", body: "Un companion care ascultă, răspunde și ține ritmul unei comunități în continuă mișcare.", tone: "blue", icon: "eye" },
];
