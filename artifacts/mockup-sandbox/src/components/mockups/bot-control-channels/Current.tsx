import { useState } from "react";
import {
  Activity, Bot, Check, ChevronDown, Megaphone, Radio, RefreshCw, ShieldCheck,
  Ticket, Users, Wrench,
} from "lucide-react";
import "./_group.css";

const channelFields = [
  ["main", "Cufere și Oracol"], ["event", "Ora Umbrelor"], ["boss", "Dragonul Stins"],
  ["trader", "Negustorul"], ["eventTop", "Top Ora Umbrelor"], ["bossTop", "Top Dragonul Stins"],
  ["council", "Consiliul Umbrelor"], ["fratia", "Chivotul Frăției"],
] as const;

const channels = [
  { id: "121708440221", name: "cufere-si-oracol", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440222", name: "ora-umbrelor", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440223", name: "dragonul-stins", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440224", name: "negustorul", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440225", name: "clasamente", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440231", name: "consiliul-umbrelor", parent: "ADMINISTRATOR", type: "text" },
  { id: "121708440232", name: "chivotul-fratiei", parent: "ADMINISTRATOR", type: "text" },
  { id: "121708440240", name: "AUDIT", parent: "ADMINISTRATOR", type: "category" },
];

const categories = [
  { key: "gameplay", label: "Joc și evenimente", description: "Cufere, Oracol, lupte, boss, negustor și clasamente.", items: "Cufere și Oracol · Ora Umbrelor · Dragonul Stins · Negustorul · Clasamente" },
  { key: "admin", label: "Administrator", description: "Consiliu, Frăție, audit și categoriile de tichete.", items: "Consiliul Umbrelor · Chivotul Frăției · Tichete · Audit" },
  { key: "filtered", label: "Mesaje filtrate", description: "Jurnale pentru anti-spam și moderarea AI.", items: "Jurnal anti-spam · Jurnal moderare AI" },
  { key: "links", label: "Linkuri", description: "Categorie pregătită pentru canalele de filtrare linkuri.", items: "Categorie Linkuri" },
  { key: "security", label: "Securitate", description: "Alerte anti-raid și comportament suspect.", items: "Alerte anti-raid · Alerte comportament suspect" },
  { key: "verification", label: "Verificare", description: "Canalul pentru verificarea membrilor.", items: "Canal verificare" },
];
const roles = ["Administrator", "Moderator", "Cronicar", "Cavaler al Ordinului"];

export function Current() {
  const [activeTab, setActiveTab] = useState("channels");
  const [selected, setSelected] = useState<Record<string, string>>({
    main: channels[0].id, event: channels[1].id, boss: channels[2].id, trader: channels[3].id,
    eventTop: channels[4].id, bossTop: channels[4].id, council: channels[5].id, fratia: channels[6].id,
  });
  const [chosen, setChosen] = useState(["gameplay", "admin"]);
  const [synced, setSynced] = useState(false);

  const sync = () => { setSynced(true); window.setTimeout(() => setSynced(false), 1800); };
  return (
    <main className="bot-control min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
          <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight"><Bot className="h-8 w-8 text-primary" /> Control bot</h1>
          <p className="text-muted-foreground">Gestionează infrastructura botului dintr-un singur loc. Accesul la această pagină este limitat la owner.</p>
        </header>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          Botul Discord nu este conectat la această instanță. Modificările pot fi salvate, dar devin active pe Discord doar după reconectarea botului.
        </div>

        <nav className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:grid-cols-5">
          {[
            ["channels", Radio, "Canale"], ["tickets", Ticket, "Tichete"], ["verification", ShieldCheck, "Verificare"],
            ["messages", Megaphone, "Mesaje"], ["statistics", Activity, "Statistici"],
          ].map(([key, Icon, label]) => {
            const TabIcon = Icon as typeof Radio;
            return <button key={key as string} type="button" onClick={() => setActiveTab(key as string)} data-active={activeTab === key} className="mod-tab-trigger flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm text-muted-foreground"><TabIcon className="h-4 w-4" />{label as string}</button>;
          })}
        </nav>

        {activeTab !== "channels" ? (
          <section className="mod-tab-content rounded-xl border border-border bg-card p-8 text-center">
            <Wrench className="mx-auto mb-3 h-8 w-8 text-primary" /><h2 className="font-medium">{activeTab === "tickets" ? "Tichete Discord" : activeTab === "verification" ? "Verificare membri" : activeTab === "messages" ? "Mesaje automate" : "Statistici bot"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Această zonă este disponibilă în controlul botului.</p>
          </section>
        ) : <section className="mod-tab-content space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Radio className="mt-1 h-5 w-5 text-primary" /><div className="min-w-0 flex-1"><h2 className="font-medium">Canale Discord</h2><p className="text-xs text-muted-foreground">Folosește canalele configurate sau găsește canalele existente după nume. Creează doar destinațiile care lipsesc.</p></div>
            <button type="button" onClick={sync} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"><RefreshCw className={`h-4 w-4 ${synced ? "text-green-400" : ""}`} />{synced ? "Sincronizat" : "Creează ce lipsește"}</button>
          </div>
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">Butonul este disponibil după ce botul primește permisiunea Discord <strong>Manage Channels</strong>.</p>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-4 md:grid-cols-2">
              {channelFields.map(([key, label]) => <div key={key} className={`mod-setting-card space-y-2 rounded-lg border border-transparent p-3 ${selected[key] ? "mod-setting-card--selected" : ""}`}>
                <label className="text-sm font-medium">{label}</label>
                <select value={selected[key] ?? ""} onChange={(e) => setSelected({ ...selected, [key]: e.target.value })} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="">Neconfigurat</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.type === "category" ? "Categorie" : "#"} {channel.name} · {channel.parent} ({channel.id})</option>)}
                </select>
                <input value={selected[key] ?? ""} aria-label={`${label} ID`} onChange={(e) => setSelected({ ...selected, [key]: e.target.value.trim() })} placeholder="ID canal Discord" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground" />
              </div>)}
            </div>
            <aside className="h-fit rounded-lg border border-primary/25 bg-primary/[.04] p-4">
              <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-xs font-mono tracking-widest text-primary">CE SE CREEAZĂ</p><h3 className="mt-1 font-medium">Alege categoriile</h3></div><span className="rounded-full border border-primary/30 px-2 py-1 text-[11px] text-primary">{chosen.length}/{categories.length}</span></div>
              <p className="mb-4 text-xs leading-5 text-muted-foreground">Bifează doar ce vrei să creeze botul. Categoriile nebifate nu sunt atinse.</p>
              <div className="space-y-2">{categories.map((category) => { const checked = chosen.includes(category.key); return <div key={category.key} className={`rounded-md border p-3 ${checked ? "border-primary/40 bg-primary/10" : "border-border/70"}`}>
                <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={checked} onChange={(e) => setChosen(e.target.checked ? [...chosen, category.key] : chosen.filter((key) => key !== category.key))} /><span className="min-w-0"><span className="block text-sm font-medium">{category.label}</span><span className="mt-1 block text-xs leading-4 text-muted-foreground">{category.description}</span><span className="mt-2 block text-[11px] leading-4 text-muted-foreground/80">{category.items}</span></span></label>
                <details className="mt-3 rounded-md border border-border/70 bg-background/30 p-2"><summary className="flex cursor-pointer select-none items-center gap-1 text-xs font-medium text-primary"><ChevronDown className="h-3 w-3" />Permisiuni pentru această categorie</summary><div className="mt-3 space-y-3"><p className="text-[11px] leading-4 text-muted-foreground">Dacă alegi roluri, membrii fără unul dintre ele nu vor vedea canalele din categorie. Botul își păstrează accesul automat.</p><div className="grid gap-2">{roles.map((role) => <label key={role} className="flex items-center gap-2 rounded border border-border/60 px-2 py-1.5 text-xs"><input type="checkbox" defaultChecked={role === "Moderator"} className="accent-primary" /><Users className="h-3 w-3 text-muted-foreground" /><span className="truncate">@{role}</span></label>)}</div><div className="grid gap-2 sm:grid-cols-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" defaultChecked className="accent-primary" />Pot vedea istoricul</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" defaultChecked className="accent-primary" />Pot scrie mesaje</label></div></div></details>
              </div>; })}</div>
              <div className="mt-4 flex gap-2"><button type="button" onClick={() => setChosen(categories.map((category) => category.key))} className="flex-1 rounded-md px-3 py-2 text-xs hover:bg-accent">Toate</button><button type="button" onClick={() => setChosen([])} className="flex-1 rounded-md px-3 py-2 text-xs hover:bg-accent">Niciuna</button></div>
            </aside>
          </div>
        </section>}
      </div>
    </main>
  );
}