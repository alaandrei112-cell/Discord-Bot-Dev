import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Folder,
  Hash,
  LockKeyhole,
  Megaphone,
  Play,
  Radio,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Ticket,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import "./_group.css";

type TabKey = "channels" | "tickets" | "verification" | "messages" | "statistics";

type ChannelField = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type Channel = {
  id: string;
  name: string;
  parent: string;
  type: "text" | "category";
};

type Category = {
  key: string;
  label: string;
  description: string;
  items: string[];
};

type PermissionState = {
  roles: string[];
  readHistory: boolean;
  sendMessages: boolean;
};

const channelFields: ChannelField[] = [
  { key: "main", label: "Cufere și Oracol", description: "Recompense, chei și mesajele Oracolului", icon: Radio },
  { key: "event", label: "Ora Umbrelor", description: "Anunțuri și rezultate pentru eveniment", icon: Clock3 },
  { key: "boss", label: "Dragonul Stins", description: "Lupte, damage și clasament de boss", icon: ShieldCheck },
  { key: "trader", label: "Negustorul", description: "Oferte și rotația comerciantului", icon: Settings2 },
  { key: "eventTop", label: "Top Ora Umbrelor", description: "Clasamentul ultimului eveniment", icon: Activity },
  { key: "bossTop", label: "Top Dragonul Stins", description: "Clasamentul permanent de boss", icon: Activity },
  { key: "council", label: "Consiliul Umbrelor", description: "Comenzi administrative și audit", icon: LockKeyhole },
  { key: "fratia", label: "Chivotul Frăției", description: "Mesaje și alerte pentru frăție", icon: Users },
];

const channels: Channel[] = [
  { id: "121708440221", name: "cufere-si-oracol", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440222", name: "ora-umbrelor", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440223", name: "dragonul-stins", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440224", name: "negustorul", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440225", name: "clasamente", parent: "JOC ȘI EVENIMENTE", type: "text" },
  { id: "121708440231", name: "consiliul-umbrelor", parent: "ADMINISTRATOR", type: "text" },
  { id: "121708440232", name: "chivotul-fratiei", parent: "ADMINISTRATOR", type: "text" },
  { id: "121708440240", name: "AUDIT", parent: "ADMINISTRATOR", type: "category" },
];

const categories: Category[] = [
  {
    key: "gameplay",
    label: "Joc și evenimente",
    description: "Fluxurile care țin serverul activ și informativ.",
    items: ["Cufere și Oracol", "Ora Umbrelor", "Dragonul Stins", "Negustorul", "Clasamente"],
  },
  {
    key: "admin",
    label: "Administrator",
    description: "Instrumente private pentru echipă și audit.",
    items: ["Consiliul Umbrelor", "Chivotul Frăției", "Tichete", "Audit"],
  },
  {
    key: "filtered",
    label: "Mesaje filtrate",
    description: "Jurnale pentru anti-spam și moderarea AI.",
    items: ["Jurnal anti-spam", "Jurnal moderare AI"],
  },
  {
    key: "links",
    label: "Linkuri",
    description: "Destinație pentru mesajele cu linkuri filtrate.",
    items: ["Categorie Linkuri"],
  },
  {
    key: "security",
    label: "Securitate",
    description: "Alerte anti-raid și comportament suspect.",
    items: ["Alerte anti-raid", "Alerte comportament suspect"],
  },
  {
    key: "verification",
    label: "Verificare",
    description: "Spațiul pentru verificarea membrilor noi.",
    items: ["Canal verificare"],
  },
];

const roles = ["Administrator", "Moderator", "Cronicar", "Cavaler al Ordinului"];

const tabItems: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "channels", label: "Canale", icon: Radio },
  { key: "tickets", label: "Tichete", icon: Ticket },
  { key: "verification", label: "Verificare", icon: ShieldCheck },
  { key: "messages", label: "Mesaje", icon: Megaphone },
  { key: "statistics", label: "Statistici", icon: Activity },
];

const defaultSelected: Record<string, string> = {
  main: channels[0].id,
  event: channels[1].id,
  boss: channels[2].id,
  trader: channels[3].id,
  eventTop: channels[4].id,
  bossTop: channels[4].id,
  council: channels[5].id,
  fratia: channels[6].id,
};

const defaultPermissions: Record<string, PermissionState> = Object.fromEntries(
  categories.map((category) => [
    category.key,
    { roles: category.key === "admin" ? ["Administrator", "Moderator"] : ["Moderator"], readHistory: true, sendMessages: category.key !== "filtered" },
  ]),
) as Record<string, PermissionState>;

function ChannelSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      data-testid="select-channel-destination"
      className="h-10 w-full rounded-md border border-border bg-background/70 px-3 text-sm text-foreground transition-colors hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
    >
      <option value="">Neconfigurat</option>
      {channels.map((channel) => (
        <option key={channel.id} value={channel.id}>
          {channel.type === "category" ? "Categorie" : "#"} {channel.name} · {channel.parent} ({channel.id})
        </option>
      ))}
    </select>
  );
}

function PermissionPanel({
  category,
  permission,
  onChange,
}: {
  category: Category;
  permission: PermissionState;
  onChange: (next: PermissionState) => void;
}) {
  const toggleRole = (role: string) => {
    const rolesForCategory = permission.roles.includes(role)
      ? permission.roles.filter((item) => item !== role)
      : [...permission.roles, role];
    onChange({ ...permission, roles: rolesForCategory });
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/25 bg-background/65 p-3" data-testid={`panel-permissions-${category.key}`}>
      <div className="mb-3 flex items-start gap-2">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold text-foreground">Permisiuni pentru {category.label}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Membrii cu rolurile selectate văd canalele create în această categorie. Botul își păstrează accesul automat.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <label
            key={role}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-card/60 px-2.5 py-2 text-xs transition-colors hover:border-primary/35 hover:bg-accent/60"
          >
            <input
              type="checkbox"
              checked={permission.roles.includes(role)}
              onChange={() => toggleRole(role)}
              data-testid={`checkbox-role-${category.key}-${role.toLowerCase().replaceAll(" ", "-")}`}
              className="accent-primary"
            />
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">@{role}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={permission.readHistory}
            onChange={(event) => onChange({ ...permission, readHistory: event.target.checked })}
            data-testid={`checkbox-history-${category.key}`}
            className="accent-primary"
          />
          Pot vedea istoricul
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={permission.sendMessages}
            onChange={(event) => onChange({ ...permission, sendMessages: event.target.checked })}
            data-testid={`checkbox-send-${category.key}`}
            className="accent-primary"
          />
          Pot scrie mesaje
        </label>
      </div>
    </div>
  );
}

export function Redesign() {
  const [activeTab, setActiveTab] = useState<TabKey>("channels");
  const [selectedChannels, setSelectedChannels] = useState<Record<string, string>>(defaultSelected);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["gameplay", "admin"]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>("gameplay");
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>(defaultPermissions);
  const [feedback, setFeedback] = useState<"idle" | "provisioning" | "provisioned" | "saved" | "tested">("idle");

  const configuredCount = useMemo(
    () => Object.values(selectedChannels).filter(Boolean).length,
    [selectedChannels],
  );

  const updateChannel = (key: string, value: string) => {
    setSelectedChannels((current) => ({ ...current, [key]: value }));
  };

  const runFeedback = (next: "provisioning" | "provisioned" | "saved" | "tested", duration = 1800) => {
    setFeedback(next);
    window.setTimeout(() => setFeedback("idle"), duration);
  };

  const handleProvision = () => {
    runFeedback("provisioning", 1150);
    window.setTimeout(() => runFeedback("provisioned", 2100), 1150);
  };

  const handleSave = () => runFeedback("saved", 2200);
  const handleTest = () => runFeedback("tested", 2200);

  return (
    <main className="bot-control min-h-[100dvh] px-4 py-6 text-foreground sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-primary/45 bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </span>
              <p className="mod-eyebrow">CONTROL OWNER-ONLY</p>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Control bot</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Configurează destinațiile Discord și regulile de creare fără să pierzi din vedere ce se schimbă.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start rounded-lg border border-border/80 bg-card/70 px-3 py-2 lg:self-auto">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-amber-100">Bot deconectat</p>
              <p className="text-[10px] text-muted-foreground">Ultima verificare acum 4 min</p>
            </div>
          </div>
        </header>

        <div className="mb-6 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[.07] p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="min-w-0 text-xs leading-5 text-amber-100/90">
            <strong className="font-semibold text-amber-100">Modificările rămân în așteptare.</strong>{" "}
            Botul Discord nu este conectat la această instanță. Salvarea este disponibilă acum, iar setările devin active după reconectare.
          </div>
          <button
            type="button"
            onClick={() => runFeedback("tested")}
            data-testid="button-view-connection-help"
            className="ml-auto hidden shrink-0 items-center gap-1 self-start rounded px-2 py-1 text-[11px] font-medium text-amber-100 transition-colors hover:bg-amber-200/10 sm:inline-flex"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            Detalii
          </button>
        </div>

        <nav className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card/80 p-1 sm:grid-cols-5" aria-label="Secțiuni control bot">
          {tabItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              data-active={activeTab === key}
              data-testid={`tab-${key}`}
              className="mod-tab-trigger flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/70 hover:text-foreground sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {activeTab !== "channels" ? (
          <section className="mod-tab-content min-h-[24rem] rounded-xl border border-border bg-card/85 p-8 sm:p-12" data-testid={`tab-panel-${activeTab}`}>
            <div className="mx-auto flex max-w-md flex-col items-center text-center">
              <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <Wrench className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-semibold">
                {activeTab === "tickets" ? "Tichete Discord" : activeTab === "verification" ? "Verificare membri" : activeTab === "messages" ? "Mesaje automate" : "Statistici bot"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Această zonă este disponibilă în controlul botului. Canalele și permisiunile pot fi pregătite din secțiunea Canale.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("channels")}
                data-testid="button-return-to-channels"
                className="mt-6 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <Radio className="h-3.5 w-3.5" />
                Înapoi la canale
              </button>
            </div>
          </section>
        ) : (
          <section className="mod-tab-content space-y-5" data-testid="tab-panel-channels">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="space-y-5">
                <section className="rounded-xl border border-border bg-card/85 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                        <Radio className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold">Destinații de canal</h2>
                          <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {configuredCount}/8 configurate
                          </span>
                        </div>
                        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                          Alege un canal existent sau introdu manual ID-ul Discord. Fiecare flux are o destinație vizibilă aici.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleProvision}
                      disabled={feedback === "provisioning"}
                      data-testid="button-provision-channels"
                      className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-primary/45 bg-primary/10 px-3 text-xs font-semibold text-primary transition-all hover:border-primary/70 hover:bg-primary/15 disabled:cursor-wait disabled:opacity-70"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${feedback === "provisioning" ? "animate-spin" : ""}`} />
                      {feedback === "provisioning" ? "Se sincronizează" : feedback === "provisioned" ? "Destinații verificate" : "Creează ce lipsește"}
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2.5 md:grid-cols-2">
                    {channelFields.map(({ key, label, description, icon: Icon }) => {
                      const current = selectedChannels[key] ?? "";
                      const currentChannel = channels.find((channel) => channel.id === current);
                      return (
                        <div
                          key={key}
                          className={`rounded-lg border p-3 transition-all ${current ? "border-primary/35 bg-primary/[.045]" : "border-border/75 bg-background/15 hover:border-border"}`}
                          data-testid={`card-channel-${key}`}
                        >
                          <div className="mb-2 flex items-start gap-2.5">
                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${current ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="min-w-0">
                              <label htmlFor={`channel-${key}`} className="block text-sm font-medium text-foreground">{label}</label>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>
                            </div>
                            {current && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                          </div>
                          <ChannelSelect value={current} onChange={(value) => updateChannel(key, value)} />
                          <div className="mt-2 flex items-center gap-2">
                            <Hash className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <input
                              id={`channel-${key}`}
                              value={current}
                              onChange={(event) => updateChannel(key, event.target.value.trim())}
                              placeholder="ID canal Discord"
                              aria-label={`${label} ID`}
                              data-testid={`input-channel-id-${key}`}
                              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background/55 px-2.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                            />
                            <span className="hidden max-w-[9rem] truncate text-[10px] text-muted-foreground sm:block">
                              {currentChannel ? `#${currentChannel.name}` : "ID manual"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card/85 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-400/25 bg-amber-400/[.07] text-amber-300">
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-semibold">Permisiuni necesare</h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Verifică accesul botului înainte de provisioning pentru a evita categorii create incomplet.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      ["Manage Channels", "Necesară", true],
                      ["Manage Permissions", "Necesară", true],
                      ["Send Messages", "Disponibilă", false],
                    ].map(([label, status, warning]) => (
                      <div key={label as string} className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/20 px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">{label as string}</span>
                        <span className={`flex items-center gap-1 text-[10px] font-medium ${warning ? "text-amber-200" : "text-emerald-300"}`}>
                          {warning ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                          {status as string}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-amber-100/75">
                    <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Butonul de provisioning va rămâne blocat pe Discord până când botul primește permisiunea <strong className="font-medium text-amber-100">Manage Channels</strong>.</span>
                  </p>
                </section>
              </div>

              <aside className="h-fit rounded-xl border border-primary/30 bg-primary/[.045] p-4 xl:sticky xl:top-4" data-testid="panel-provisioning">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mod-eyebrow">PROVISIONING</p>
                    <h2 className="mt-1 text-base font-semibold">Ce se creează</h2>
                  </div>
                  <span className="rounded-full border border-primary/35 bg-background/30 px-2 py-1 font-mono text-[10px] text-primary">
                    {selectedCategories.length}/{categories.length}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Selectează doar categoriile pe care botul are voie să le pregătească. Celelalte nu sunt atinse.
                </p>

                <div className="mt-4 space-y-1.5">
                  {categories.map((category) => {
                    const isSelected = selectedCategories.includes(category.key);
                    const isExpanded = expandedCategory === category.key;
                    return (
                      <div
                        key={category.key}
                        className={`rounded-lg border transition-colors ${isSelected ? "border-primary/35 bg-primary/[.07]" : "border-border/70 bg-background/15 hover:border-border"}`}
                        data-testid={`row-category-${category.key}`}
                      >
                        <div className="flex items-center gap-2.5 px-2.5 py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => {
                              setSelectedCategories((current) => event.target.checked ? [...current, category.key] : current.filter((key) => key !== category.key));
                              if (event.target.checked) setExpandedCategory(category.key);
                            }}
                            data-testid={`checkbox-category-${category.key}`}
                            className="accent-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setExpandedCategory(isExpanded ? null : category.key)}
                            data-testid={`button-expand-category-${category.key}`}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <Folder className="h-3.5 w-3.5 text-primary" />
                              {category.label}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{category.items.length} destinații · {category.description}</span>
                          </button>
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180 text-primary" : ""}`} />
                        </div>
                        {isExpanded && isSelected && (
                          <div className="border-t border-border/60 px-2.5 pb-2.5">
                            <div className="mt-2 flex flex-wrap gap-1">
                              {category.items.map((item) => (
                                <span key={item} className="rounded border border-border/70 bg-background/40 px-1.5 py-1 text-[10px] text-muted-foreground">{item}</span>
                              ))}
                            </div>
                            <PermissionPanel
                              category={category}
                              permission={permissions[category.key]}
                              onChange={(next) => setPermissions((current) => ({ ...current, [category.key]: next }))}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCategories(categories.map((category) => category.key))}
                    data-testid="button-select-all-categories"
                    className="rounded-md border border-border/70 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                  >
                    Toate
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategories([])}
                    data-testid="button-clear-categories"
                    className="rounded-md border border-border/70 px-2 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                  >
                    Niciuna
                  </button>
                </div>
              </aside>
            </div>

            <footer className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border border-border/90 bg-card/95 p-3 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                {feedback === "saved" || feedback === "tested" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
                <span className="truncate">
                  {feedback === "saved" ? "Controlul botului a fost salvat local." : feedback === "tested" ? "Fluxul de test a fost pregătit." : "Ai modificări locale nesalvate."}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleTest}
                  data-testid="button-test-flow"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <Play className="h-3.5 w-3.5" />
                  Testează fluxul
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  data-testid="button-save-bot-control"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:bg-primary/90 hover:shadow-primary/20"
                >
                  {feedback === "saved" ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {feedback === "saved" ? "Salvat" : "Salvează controlul botului"}
                </button>
              </div>
            </footer>
          </section>
        )}
      </div>
    </main>
  );
}