import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";

type Config = Record<string, any>;
type Path = Array<string | number>;
export type ConfigSection = "automod" | "anti-raid" | "anti-spam" | "anti-flood" | "suspicious" | "ai" | "tools" | "cases-audit" | "roles-channels" | "time" | "escalation" | "embeds" | "permissions";
const VisibleSections = React.createContext<ReadonlySet<string> | null>(null);
type DiscordRoleOption = { id: string; name: string; managed?: boolean };
type ActivityLogCapabilities = {
  online?: boolean;
  canManageChannels?: boolean;
  canManageRoles?: boolean;
};

const ACTIONS = [
  ["none", "Nicio acțiune"],
  ["warn", "Avertisment"],
  ["mute", "Restricționează (mute)"],
  ["kick", "Elimină (kick)"],
  ["ban", "Blochează (ban)"],
  ["delete", "Șterge mesajul"],
] as const;
const SCAM_ACTIONS = [
  ["delete", "Șterge doar mesajul"],
  ["mute", "Șterge + timeout 10 minute"],
  ["kick", "Șterge + elimină membrul (kick)"],
] as const;
const SEVERITIES = [["soft", "Blândă"], ["normal", "Normală"], ["hard", "Strictă"]] as const;
const SENSITIVITIES = [["low", "Scăzută"], ["medium", "Medie"], ["high", "Ridicată"]] as const;

/** Immutable nested update used by every control, including numeric thresholds. */
export function updateConfigField<T extends Config>(config: T, path: Path, value: unknown): T {
  const copy = Array.isArray(config) ? [...config] : { ...config };
  let target: any = copy;
  let source: any = config;
  path.slice(0, -1).forEach((part, index) => {
    const nextPart = path[index + 1];
    const existing = source?.[part];
    const next = Array.isArray(existing) ? [...existing] : { ...(existing ?? (typeof nextPart === "number" ? [] : {})) };
    target[part] = next;
    target = next;
    source = existing;
  });
  target[path[path.length - 1]] = value;
  return copy as T;
}

function removeConfigField<T extends Config>(config: T, path: Path): T {
  const copy = updateConfigField(config, path.slice(0, -1), { ...(path.length > 1 ? getValue(config, path.slice(0, -1)) : config) });
  let target: any = copy;
  path.slice(0, -1).forEach((part) => { target = target[part]; });
  delete target[path[path.length - 1]];
  return copy;
}

function getValue(config: Config, path: Path): any {
  return path.reduce((value, key) => value?.[key], config);
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {help && <span className="block text-xs text-muted-foreground">{help}</span>}
    </label>
  );
}

function Toggle({ label, help, checked, onChange, disabled = false, testId }: {
  label: string; help?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      <Switch aria-label={label} data-testid={testId} checked={Boolean(checked)} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function TextField({ label, help, value, onChange, placeholder, type = "text", disabled = false }: {
  label: string; help?: string; value: string | null | undefined; onChange: (value: string) => void;
  placeholder?: string; type?: React.HTMLInputTypeAttribute; disabled?: boolean;
}) {
  return <Field label={label} help={help}><Input type={type} value={value ?? ""} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></Field>;
}

function NumberField({ label, help, value, onChange, min, max }: {
  label: string; help?: string; value: number | undefined; onChange: (value: number | undefined) => void; min?: number; max?: number;
}) {
  return (
    <Field label={label} help={help}>
      <Input type="number" min={min} max={max} value={value ?? ""} onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === "" ? undefined : Number(raw));
      }} />
    </Field>
  );
}

function Choice({ label, help, value, options, onChange, testId }: {
  label: string; help?: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; testId?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
}

function IdField({ label, help, value, onChange, role = false }: {
  label: string; help?: string; value: string | null; onChange: (value: string | null) => void; role?: boolean;
}) {
  return <TextField label={label} help={help ?? `ID ${role ? "rol" : "canal"} Discord (Developer Mode); lasă gol pentru neconfigurat.`} value={value} placeholder="123456789012345678" onChange={(next) => onChange(next.trim() || null)} />;
}

function ListField({ label, help, values, onChange, ids = false, testId }: {
  label: string; help: string; values: string[]; onChange: (value: string[]) => void; ids?: boolean; testId?: string;
}) {
  return (
    <Field label={label} help={help}>
      <Textarea
        value={(values ?? []).join("\n")}
        data-testid={testId}
        placeholder={ids ? "123456789012345678\n987654321098765432" : "Un element pe fiecare rând"}
        onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}
      />
    </Field>
  );
}

type Threshold = { key: string; label: string; help: string; min: number; max: number; groupKeys: string[] };
type RuleProps = { title: string; help?: string; rule: any; thresholds: Threshold[]; onChange: (path: string[], value: any) => void };

function RuleEditor({ title, help, rule, thresholds, onChange }: RuleProps) {
  const thresholdFields = thresholds.map((field) => ({
    ...field,
    groupKeys: field.groupKeys.length > 1
      ? field.groupKeys
      : thresholds
        .filter((candidate) => candidate.min === field.min && candidate.max === field.max)
        .map((candidate) => candidate.key),
  })).filter((field, index, fields) =>
    fields.findIndex((candidate) => candidate.groupKeys.join("|") === field.groupKeys.join("|")) === index,
  );
  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div><h4 className="font-medium">{title}</h4>{help && <p className="text-xs text-muted-foreground">{help}</p>}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle label="Regulă activă" checked={rule.enabled} onChange={(value) => onChange(["enabled"], value)} />
        <Choice label="Acțiune" value={rule.action} options={ACTIONS} onChange={(value) => onChange(["action"], value)} />
        <Choice label="Severitate" value={rule.severity} options={SEVERITIES} onChange={(value) => onChange(["severity"], value)} />
      </div>
      {thresholds.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {thresholdFields.map((threshold) => (
            <NumberField
              key={threshold.key}
              label={threshold.label}
              help={threshold.help}
              value={rule.thresholds?.[threshold.key] ?? threshold.groupKeys
                .map((key) => rule.thresholds?.[key])
                .find((value) => value !== undefined)}
              min={threshold.min}
              max={threshold.max}
              onChange={(value) => {
                const nextThresholds = { ...(rule.thresholds ?? {}) };
                // Remove legacy aliases before writing the preferred key. Otherwise
                // the engine may read an older alias first despite a new UI value.
                for (const key of threshold.groupKeys) delete nextThresholds[key];
                if (value !== undefined) nextThresholds[threshold.key] = value;
                onChange(["thresholds"], nextThresholds);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const threshold = (
  key: string,
  label: string,
  help: string,
  min: number,
  max: number,
  groupKeys: string[] = [key],
): Threshold => ({ key, label, help, min, max, groupKeys });
const EMOJI_KEYS = ["emoji", "limit", "max"];
const CAPS_KEYS = ["capsPercent", "percent", "limit"];
const REPEAT_KEYS = ["repeat", "limit", "max"];
const RUN_KEYS = ["run", "limit", "max"];
const WINDOW_KEYS = ["windowMs", "window", "seconds"];
const EMOJI_LIMIT = [
  threshold("emoji", "Emoji", "Număr maxim de emoji.", 1, 200, EMOJI_KEYS),
  threshold("limit", "Limită emoji (alias)", "Alias compatibil pentru limită.", 1, 200, EMOJI_KEYS),
  threshold("max", "Maxim emoji (alias)", "Alias compatibil pentru limită.", 1, 200, EMOJI_KEYS),
];
const CAPS_LIMIT = [
  threshold("capsPercent", "Procent majuscule", "Procent între 1 și 100.", 1, 100, CAPS_KEYS),
  threshold("percent", "Procent (alias)", "Alias compatibil pentru procent.", 1, 100, CAPS_KEYS),
  threshold("limit", "Limită (alias)", "Alias compatibil pentru procent.", 1, 100, CAPS_KEYS),
];
const REPEAT_LIMIT = [
  threshold("repeat", "Repetări", "Număr de repetări consecutive.", 2, 200, REPEAT_KEYS),
  threshold("limit", "Limită repetări (alias)", "Alias compatibil pentru repetări.", 2, 200, REPEAT_KEYS),
  threshold("max", "Maxim repetări (alias)", "Alias compatibil pentru repetări.", 2, 200, REPEAT_KEYS),
];
const RAID_LIMIT = [
  threshold("joins", "Intrări", "Intrări observate în fereastră.", 1, 10000, ["limit", "joins"]),
  threshold("limit", "Limită intrări (alias)", "Alias compatibil pentru intrări.", 1, 10000, ["limit", "joins"]),
  threshold("windowSeconds", "Fereastră (secunde)", "Intervalul de măsurare, în secunde.", 1, 3600, ["windowSeconds", "window"]),
];
const MESSAGE_SPAM = [
  threshold("messages", "Mesaje", "Mesaje până la declanșare.", 1, 1000, ["messages", "limit", "max"]),
  threshold("limit", "Limită mesaje (alias)", "Alias compatibil pentru numărul de mesaje.", 1, 1000, ["messages", "limit", "max"]),
  threshold("max", "Maxim mesaje (alias)", "Alias compatibil pentru numărul de mesaje.", 1, 1000, ["messages", "limit", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
  threshold("seconds", "Secunde (alias)", "Alias compatibil pentru interval.", 1, 3600, WINDOW_KEYS),
];
const EDIT_SPAM = [
  threshold("edits", "Editări", "Editări până la declanșare.", 1, 1000, ["limit", "edits", "max"]),
  threshold("limit", "Limită editări (alias)", "Alias compatibil pentru numărul de editări.", 1, 1000, ["limit", "edits", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
];
const DELETE_SPAM = [
  threshold("deletes", "Ștergeri", "Ștergeri până la declanșare.", 1, 1000, ["limit", "deletes", "max"]),
  threshold("limit", "Limită ștergeri (alias)", "Alias compatibil pentru numărul de ștergeri.", 1, 1000, ["limit", "deletes", "max"]),
  threshold("windowMs", "Fereastră (secunde)", "Intervalul de măsurare în secunde.", 1, 3600, WINDOW_KEYS),
];
const MENTION_LIMIT = [
  threshold("mentions", "Mențiuni", "Mențiuni într-un mesaj până la declanșare.", 1, 100, ["mentions", "limit", "max"]),
  threshold("limit", "Limită mențiuni (alias)", "Alias compatibil pentru numărul de mențiuni.", 1, 100, ["mentions", "limit", "max"]),
  threshold("max", "Maxim mențiuni (alias)", "Alias compatibil pentru numărul de mențiuni.", 1, 100, ["mentions", "limit", "max"]),
];
const FLOOD_LENGTH = [
  threshold("length", "Lungime mesaj", "Număr de caractere în mesaj.", 1, 10000, ["length", "maxLength", "limit"]),
  threshold("maxLength", "Lungime maximă (alias)", "Alias compatibil pentru lungime.", 1, 10000, ["length", "maxLength", "limit"]),
  threshold("limit", "Limită (alias)", "Alias compatibil pentru lungime.", 1, 10000, ["length", "maxLength", "limit"]),
];
const FLOOD_RUN = [
  threshold("run", "Lungime șir", "Caractere identice consecutive.", 2, 2000, ["run", "limit", "max"]),
  threshold("limit", "Limită șir (alias)", "Alias compatibil pentru lungime șir.", 2, 2000, ["run", "limit", "max"]),
  threshold("max", "Maxim șir (alias)", "Alias compatibil pentru lungime șir.", 2, 2000, ["run", "limit", "max"]),
];
const SUSPICIOUS_LIMIT = [
  threshold("changes", "Schimbări / evenimente", "Număr de evenimente până la alertă.", 1, 1000, ["changes", "limit"]),
  threshold("limit", "Limită (alias)", "Alias compatibil pentru numărul de evenimente.", 1, 1000, ["changes", "limit"]),
];

function Section({ value, title, description, children }: { value: string; title: string; description: string; children: React.ReactNode }) {
  const visible = React.useContext(VisibleSections);
  if (visible && !visible.has(value)) return null;
  return (
    <AccordionItem value={value} className="rounded-xl border border-border bg-card px-5">
      <AccordionTrigger className="no-underline hover:no-underline">
        <span><span className="block text-base">{title}</span><span className="block pt-1 text-xs font-normal text-muted-foreground">{description}</span></span>
      </AccordionTrigger>
      <AccordionContent className="space-y-5">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function ConfigEditor({
  value,
  onChange,
  sections,
  discordRoles = [],
  guildId,
  botCapabilities,
}: {
  value: Config;
  onChange: (config: Config) => void;
  sections?: ConfigSection[];
  discordRoles?: DiscordRoleOption[];
  guildId?: string;
  botCapabilities?: ActivityLogCapabilities;
}) {
  const set = (path: Path, next: any) => {
    if (next === undefined && path.includes("thresholds")) onChange(removeConfigField(value, path));
    else onChange(updateConfigField(value, path, next));
  };
  const rule = (base: string[]) => (path: string[], next: any) => set([...base, ...path], next);
  const activityLogCategories = [
    ["messages", "Mesaje editate sau șterse"],
    ["members", "Intrări, ieșiri și schimbări de membri"],
    ["channels", "Canale create, schimbate sau șterse"],
    ["roles", "Roluri create, schimbate sau șterse"],
    ["voice", "Activitate vocală"],
    ["moderation", "Acțiuni de moderare"],
    ["security", "Alerte de securitate și AutoMod"],
  ] as const;
  const selectedActivityCategories = activityLogCategories.filter(([key]) => value.activityLog.categories[key]);
  const configuredActivityCount = selectedActivityCategories.filter(([key]) => value.activityLog.channelIds[key]).length;
  const missingActivityPermissions = [
    botCapabilities?.online === false ? "Botul Discord este offline." : null,
    botCapabilities?.canManageChannels === false ? "Lipsește Manage Channels." : null,
    botCapabilities?.canManageRoles === false ? "Lipsește Manage Roles." : null,
  ].filter((entry): entry is string => Boolean(entry));
  const availableLogRoles = discordRoles.filter((role) =>
    role.id !== guildId && !role.managed,
  );
  const unlistedSelectedLogRoles = (value.activityLog.roleIds as string[]).filter((id: string) =>
    !availableLogRoles.some((role) => role.id === id),
  );

  return (
    <VisibleSections.Provider value={sections ? new Set(sections) : null}>
    <Accordion type="multiple" defaultValue={sections ?? ["automod", "anti-raid", "anti-spam", "anti-flood"]} className="space-y-3">
      <Section value="automod" title="1. AutoMod" description="Filtre de cuvinte, linkuri, anti-scam, emoji, majuscule și repetări.">
        <Toggle label="Activează AutoMod" help="Comutatorul principal pentru regulile de mai jos." checked={value.autoMod.enabled} onChange={(next) => set(["autoMod", "enabled"], next)} />
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div>
            <h3 className="font-semibold">Anti-Scam</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Detectează afirmații clare despre câștiguri în bani sau crypto și mesaje suspecte de tip „claim reward” ori verificare de portofel.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              testId="toggle-anti-scam"
              label="Activează Anti-Scam"
              help="Este oprit implicit; pornește-l doar după ce alegi acțiunea."
              checked={Boolean(value.autoMod.scamFilter?.enabled)}
              onChange={(next) => set(["autoMod", "scamFilter", "enabled"], next)}
            />
            <Choice
              testId="select-anti-scam-action"
              label="Acțiune pentru mesajele detectate"
              help="Mesajul se șterge întotdeauna; timeout și kick adaugă și sancțiunea aleasă."
              value={value.autoMod.scamFilter?.action ?? "delete"}
              options={SCAM_ACTIONS}
              onChange={(next) => set(["autoMod", "scamFilter", "action"], next)}
            />
          </div>
          <ListField
            testId="input-anti-scam-phrases"
            label="Expresii suplimentare de blocat"
            help="Opțional: o expresie pe rând. Orice mesaj care conține una dintre ele va fi tratat ca scam."
            values={value.autoMod.scamPhrases ?? []}
            onChange={(next) => set(["autoMod", "scamPhrases"], next)}
          />
          <p className="text-xs text-muted-foreground" data-testid="text-anti-scam-requirements">
            Rulează numai când Protecția serverului și AutoMod general sunt pornite. Mesajele și sancțiunile apar în Cazuri/Audit.
            Timeout-ul este de 10 minute. Botul are nevoie de Message Content și Manage Messages; mute cere Moderate Members,
            iar kick cere Kick Members și un rol bot suficient de sus. Kick-ul elimină membrul, fără ban.
          </p>
        </div>
        <RuleEditor title="Filtru cuvinte" help="Lista de mai jos determină potrivirile; regula nu are un prag numeric efectiv." rule={value.autoMod.wordFilter} thresholds={[]} onChange={rule(["autoMod", "wordFilter"])} />
        <ListField label="Cuvinte interzise" help="Un cuvânt sau o expresie pe rând; maximum 500." values={value.autoMod.forbiddenWords} onChange={(next) => set(["autoMod", "forbiddenWords"], next)} />
        <RuleEditor title="Blocare linkuri" help="Lista de mai jos determină potrivirile; regula nu are un prag numeric efectiv." rule={value.autoMod.linkBlock} thresholds={[]} onChange={rule(["autoMod", "linkBlock"])} />
        <ListField label="Linkuri interzise" help="Un domeniu sau link pe rând; maximum 500." values={value.autoMod.forbiddenLinks} onChange={(next) => set(["autoMod", "forbiddenLinks"], next)} />
        <RuleEditor title="Limită emoji" rule={value.autoMod.emojiLimit} thresholds={EMOJI_LIMIT} onChange={rule(["autoMod", "emojiLimit"])} />
        <RuleEditor title="Limită majuscule" rule={value.autoMod.capsLimit} thresholds={CAPS_LIMIT} onChange={rule(["autoMod", "capsLimit"])} />
        <RuleEditor title="Blocare repetări" rule={value.autoMod.repeatBlock} thresholds={REPEAT_LIMIT} onChange={rule(["autoMod", "repeatBlock"])} />
      </Section>

      <Section value="anti-raid" title="2. Anti-raid" description="Detectează intrările rapide și conturile prea noi.">
        <Toggle label="Activează anti-raid" checked={value.antiRaid.enabled} onChange={(next) => set(["antiRaid", "enabled"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <NumberField label="Intrări pe minut" help="Între 1 și 10.000 intrări." value={value.antiRaid.joinsPerMinute} min={1} max={10000} onChange={(next) => set(["antiRaid", "joinsPerMinute"], next)} />
          <NumberField label="Vârsta minimă a contului" help="În zile (0–3650). Conturile mai noi pot declanșa regula." value={value.antiRaid.accountAgeDays} min={0} max={3650} onChange={(next) => set(["antiRaid", "accountAgeDays"], next)} />
        </div>
        <Toggle label="Blochează serverul (lockdown)" help="Activează lockdown la detectarea unui raid." checked={value.antiRaid.lockdown} onChange={(next) => set(["antiRaid", "lockdown"], next)} />
        <IdField label="Canal alerte raid" value={value.antiRaid.alertChannelId} onChange={(next) => set(["antiRaid", "alertChannelId"], next)} />
        <RuleEditor title="Regula de raid" rule={value.antiRaid.rule} thresholds={RAID_LIMIT} onChange={rule(["antiRaid", "rule"])} />
      </Section>

      <Section value="anti-spam" title="3. Anti-spam" description="Limite separate pentru mesaje, editări, ștergeri, mențiuni și emoji.">
        <Toggle label="Activează anti-spam" checked={value.antiSpam.enabled} onChange={(next) => set(["antiSpam", "enabled"], next)} />
        <IdField label="Canal jurnal anti-spam" value={value.antiSpam.logChannelId} onChange={(next) => set(["antiSpam", "logChannelId"], next)} />
        <RuleEditor title="Spam de mesaje" rule={value.antiSpam.message} thresholds={MESSAGE_SPAM} onChange={rule(["antiSpam", "message"])} />
        <RuleEditor title="Spam de editări" rule={value.antiSpam.edit} thresholds={EDIT_SPAM} onChange={rule(["antiSpam", "edit"])} />
        <RuleEditor title="Spam de ștergeri" rule={value.antiSpam.delete} thresholds={DELETE_SPAM} onChange={rule(["antiSpam", "delete"])} />
        <RuleEditor title="Spam de mențiuni" rule={value.antiSpam.mention} thresholds={MENTION_LIMIT} onChange={rule(["antiSpam", "mention"])} />
        <RuleEditor title="Spam de emoji" rule={value.antiSpam.emoji} thresholds={EMOJI_LIMIT} onChange={rule(["antiSpam", "emoji"])} />
      </Section>

      <Section value="anti-flood" title="4. Anti-flood" description="Controlează mesaje foarte lungi, șiruri, majuscule și simboluri.">
        <Toggle label="Activează anti-flood" checked={value.antiFlood.enabled} onChange={(next) => set(["antiFlood", "enabled"], next)} />
        <RuleEditor title="Mesaj lung" rule={value.antiFlood.longMessage} thresholds={FLOOD_LENGTH} onChange={rule(["antiFlood", "longMessage"])} />
        <RuleEditor title="Șir de caractere" rule={value.antiFlood.character} thresholds={FLOOD_RUN} onChange={rule(["antiFlood", "character"])} />
        <RuleEditor title="Majuscule excesive" rule={value.antiFlood.caps} thresholds={CAPS_LIMIT} onChange={rule(["antiFlood", "caps"])} />
        <RuleEditor title="Șir de simboluri" rule={value.antiFlood.symbol} thresholds={FLOOD_RUN} onChange={rule(["antiFlood", "symbol"])} />
      </Section>

      <Section value="suspicious" title="5. Comportament suspect" description="Alerte pentru schimbări neobișnuite de nickname, roluri și activitate.">
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label="Activează detecția" checked={value.suspiciousBehavior.enabled} onChange={(next) => set(["suspiciousBehavior", "enabled"], next)} />
          <Choice label="Sensibilitate" value={value.suspiciousBehavior.sensitivity} options={SENSITIVITIES} onChange={(next) => set(["suspiciousBehavior", "sensitivity"], next)} />
          <Choice label="Acțiune principală" value={value.suspiciousBehavior.action} options={ACTIONS} onChange={(next) => set(["suspiciousBehavior", "action"], next)} />
        </div>
        <IdField label="Canal alerte comportament suspect" value={value.suspiciousBehavior.alertChannelId} onChange={(next) => set(["suspiciousBehavior", "alertChannelId"], next)} />
        {[
          ["nicknameChanges", "Schimbări nickname"], ["roleChanges", "Schimbări roluri"], ["massEdits", "Editări în masă"],
          ["massDeletes", "Ștergeri în masă"], ["joinLeaveFlood", "Flux intrări / ieșiri"], ["unusualActivity", "Activitate neobișnuită"],
        ].map(([key, label]) => <RuleEditor key={key} title={label} rule={value.suspiciousBehavior[key]} thresholds={SUSPICIOUS_LIMIT} onChange={rule(["suspiciousBehavior", key])} />)}
      </Section>

      <Section value="ai" title="6. Moderare AI" description="Categorii de analiză, tonul răspunsului și jurnalizarea deciziilor AI.">
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle label="Activează AI" checked={value.ai.enabled} onChange={(next) => set(["ai", "enabled"], next)} />
          <Choice label="Sensibilitate AI" value={value.ai.sensitivity} options={SENSITIVITIES} onChange={(next) => set(["ai", "sensitivity"], next)} />
          <Choice label="Acțiune AI" value={value.ai.action} options={ACTIONS} onChange={(next) => set(["ai", "action"], next)} />
          <Choice label="Ton" value={value.ai.tone} options={[["serious", "Serios"], ["calm", "Calm"], ["strict", "Strict"]]} onChange={(next) => set(["ai", "tone"], next)} />
        </div>
        <IdField label="Canal jurnal AI" value={value.ai.logChannelId} onChange={(next) => set(["ai", "logChannelId"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["toxicity", "Toxicitate"], ["profanity", "Limbaj vulgar"], ["attacks", "Atacuri"], ["bullying", "Hărțuire"],
            ["intelligentSpam", "Spam inteligent"], ["trolling", "Trolling"],
          ].map(([key, label]) => <Toggle key={key} label={label} checked={value.ai.categories[key]} onChange={(next) => set(["ai", "categories", key], next)} />)}
        </div>
      </Section>

      <Section value="tools" title="7. Unelte staff" description="Acordă separat rolurile care pot rula fiecare comandă de moderare.">
        <Toggle label="Activează uneltele manuale" checked={value.manualTools.enabled} onChange={(next) => set(["manualTools", "enabled"], next)} />
        <Toggle label="Jurnalizează acțiunile staff-ului" checked={value.manualTools.logActions} onChange={(next) => set(["manualTools", "logActions"], next)} />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["warn", "Avertisment"], ["mute", "Restricționare"], ["kick", "Eliminare"], ["ban", "Blocare"], ["unmute", "Ridicare restricție"],
            ["purge", "Curățare mesaje"], ["slowmode", "Slowmode"], ["lock", "Blocare canal"], ["unlock", "Deblocare canal"], ["nick", "Poreclă"], ["role", "Rol"],
          ].map(([command, label]) => <ListField key={command} ids label={`Roluri pentru /${command}`} help={`${label}: un ID de rol pe rând (max. 100).`} values={value.manualTools.commandGrants[command]} onChange={(next) => set(["manualTools", "commandGrants", command], next)} />)}
        </div>
      </Section>

      <Section value="cases-audit" title="8. Cazuri și audit" description="Păstrarea cazurilor, drepturile staff-ului și canalul de audit.">
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Activează cazurile" checked={value.cases.enabled} onChange={(next) => set(["cases", "enabled"], next)} />
          <Toggle label="Staff-ul poate închide cazuri" checked={value.cases.allowStaffClose} onChange={(next) => set(["cases", "allowStaffClose"], next)} />
          <Toggle label="Staff-ul poate adăuga note" checked={value.cases.allowStaffNotes} onChange={(next) => set(["cases", "allowStaffNotes"], next)} />
          <Toggle label="Staff-ul poate exporta cazuri" checked={value.cases.allowStaffExport} onChange={(next) => set(["cases", "allowStaffExport"], next)} />
        </div>
        <NumberField label="Păstrare cazuri" help="Număr de zile, între 1 și 3650." value={value.cases.retentionDays} min={1} max={3650} onChange={(next) => set(["cases", "retentionDays"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Activează auditul" checked={value.audit.enabled} onChange={(next) => set(["audit", "enabled"], next)} />
          <Choice label="Nivel detalii audit" value={value.audit.detailLevel} options={[["minimal", "Minimal"], ["standard", "Standard"], ["verbose", "Detaliat"]]} onChange={(next) => set(["audit", "detailLevel"], next)} />
        </div>
        <IdField label="Canal audit" value={value.audit.channelId} onChange={(next) => set(["audit", "channelId"], next)} />

        <div className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div>
            <h4 className="font-semibold">Jurnal automat Discord</h4>
            <p className="mt-1 text-xs text-muted-foreground">La salvare, botul creează sau reutilizează o categorie privată și câte un canal pentru fiecare categorie activă. Conținutul mesajelor nu este copiat în log.</p>
          </div>
          <Toggle
            label="Activează jurnalizarea serverului"
            help="Oprirea oprește postările noi și păstrează canalele și istoricul."
            checked={value.activityLog.enabled}
            onChange={(next) => set(["activityLog", "enabled"], next)}
          />
          {missingActivityPermissions.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {missingActivityPermissions.join(" ")} Sunt necesare Manage Channels și Manage Roles pentru a crea ACL-uri private.
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {activityLogCategories.map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={value.activityLog.categories[key]}
                onChange={(next) => set(["activityLog", "categories", key], next)}
              />
            ))}
          </div>
          {availableLogRoles.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Roluri care pot vedea istoricul</p>
              <p className="text-xs text-muted-foreground">Toate celelalte roluri, inclusiv @everyone, sunt blocate implicit. Membrii fără unul dintre rolurile alese nu văd canalele.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableLogRoles.map((role) => (
                  <Toggle
                    key={role.id}
                    label={`@${role.name}`}
                    help={role.id}
                    checked={(value.activityLog.roleIds as string[]).includes(role.id)}
                    onChange={(checked) => {
                      const roleIds = checked
                        ? Array.from(new Set([...(value.activityLog.roleIds as string[]), role.id]))
                        : (value.activityLog.roleIds as string[]).filter((id: string) => id !== role.id);
                      set(["activityLog", "roleIds"], roleIds);
                    }}
                  />
                ))}
                {unlistedSelectedLogRoles.map((roleId: string) => (
                  <Toggle
                    key={roleId}
                    label={`Rol care nu mai este disponibil (${roleId})`}
                    checked
                    onChange={() => set(["activityLog", "roleIds"], (value.activityLog.roleIds as string[]).filter((id: string) => id !== roleId))}
                  />
                ))}
              </div>
            </div>
          ) : (
            <ListField
              ids
              label="Roluri care pot vedea istoricul"
              help="ID-uri de rol pe rând. @everyone nu este acceptat; rolurile nealese rămân fără acces."
              values={value.activityLog.roleIds}
              onChange={(next) => set(["activityLog", "roleIds"], next)}
            />
          )}
          <div role="status" className="rounded-lg border border-border bg-background/70 p-3 text-sm">
            <p className="font-medium">
              {value.activityLog.enabled
                ? `Jurnal activat în formular · ${configuredActivityCount}/${selectedActivityCategories.length} canale configurate (salvează pentru a aplica)`
                : "Jurnal oprit · canalele și istoricul existente sunt păstrate"}
            </p>
            {value.activityLog.categoryId && <p className="mt-1 text-xs text-muted-foreground">Categorie: {value.activityLog.categoryId}</p>}
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {selectedActivityCategories.map(([key, label]) => (
                <li key={key}>
                  {label}: {value.activityLog.channelIds[key]
                    ? `configurat (${value.activityLog.channelIds[key]})`
                    : value.activityLog.enabled ? "lipsește — verifică permisiunile și salvează din nou" : "se va crea la activare"}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section value="roles-channels" title="9. Roluri și canale" description="Excluderi, protecții și canale cu politici speciale.">
        <div className="grid gap-4 md:grid-cols-2">
          <ListField ids label="Roluri sancționabile" help="Roluri asupra cărora pot fi aplicate sancțiuni." values={value.roles.sanctionableRoleIds} onChange={(next) => set(["roles", "sanctionableRoleIds"], next)} />
          <ListField ids label="Roluri protejate" help="Roluri care nu trebuie sancționate automat." values={value.roles.protectedRoleIds} onChange={(next) => set(["roles", "protectedRoleIds"], next)} />
          <ListField ids label="Roluri ignorate de AutoMod" help="AutoMod nu procesează membrii cu aceste roluri." values={value.roles.ignoredAutoModRoleIds} onChange={(next) => set(["roles", "ignoredAutoModRoleIds"], next)} />
          <ListField ids label="Roluri cu permisiuni speciale" help="Roluri marcate pentru permisiuni speciale." values={value.roles.specialPermissionRoleIds} onChange={(next) => set(["roles", "specialPermissionRoleIds"], next)} />
          <ListField ids label="Canale ignorate" help="AutoMod nu procesează aceste canale." values={value.channels.ignoredChannelIds} onChange={(next) => set(["channels", "ignoredChannelIds"], next)} />
          <ListField ids label="Canale protejate" help="Canale care nu pot fi afectate de automatizări." values={value.channels.protectedChannelIds} onChange={(next) => set(["channels", "protectedChannelIds"], next)} />
          <ListField ids label="Canale slowmode automat" help="Canale unde poate fi aplicat slowmode automat." values={value.channels.autoSlowmodeChannelIds} onChange={(next) => set(["channels", "autoSlowmodeChannelIds"], next)} />
          <ListField ids label="Canale stricte" help="Canale cu politică strictă." values={value.channels.strictChannelIds} onChange={(next) => set(["channels", "strictChannelIds"], next)} />
          <ListField ids label="Canale permisive" help="Canale cu politică mai blândă." values={value.channels.softChannelIds} onChange={(next) => set(["channels", "softChannelIds"], next)} />
        </div>
      </Section>

      <Section value="time" title="10. Profile de timp" description="Fuse orar și reguli programate pentru noapte, zi, weekend și evenimente.">
        <TextField label="Fus orar IANA" help="De exemplu Europe/Bucharest sau UTC. Trebuie să fie un fus orar IANA valid." value={value.timeProfiles.timezone} onChange={(next) => set(["timeProfiles", "timezone"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Noapte strictă" checked={value.timeProfiles.strictNight.enabled} onChange={(next) => set(["timeProfiles", "strictNight", "enabled"], next)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Începe la" help="Oră 0–23." value={value.timeProfiles.strictNight.startHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "strictNight", "startHour"], next)} />
            <NumberField label="Se termină la" help="Oră 0–23." value={value.timeProfiles.strictNight.endHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "strictNight", "endHour"], next)} />
          </div>
          <Toggle label="Zi permisivă" checked={value.timeProfiles.softDay.enabled} onChange={(next) => set(["timeProfiles", "softDay", "enabled"], next)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Începe la" help="Oră 0–23." value={value.timeProfiles.softDay.startHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "softDay", "startHour"], next)} />
            <NumberField label="Se termină la" help="Oră 0–23." value={value.timeProfiles.softDay.endHour} min={0} max={23} onChange={(next) => set(["timeProfiles", "softDay", "endHour"], next)} />
          </div>
          <Toggle label="Weekend" checked={value.timeProfiles.weekend.enabled} onChange={(next) => set(["timeProfiles", "weekend", "enabled"], next)} />
          <Choice label="Severitate weekend" value={value.timeProfiles.weekend.severity} options={SEVERITIES} onChange={(next) => set(["timeProfiles", "weekend", "severity"], next)} />
          <Toggle label="Eveniment major" checked={value.timeProfiles.majorEvent.enabled} onChange={(next) => set(["timeProfiles", "majorEvent", "enabled"], next)} />
          <Choice label="Severitate eveniment major" value={value.timeProfiles.majorEvent.severity} options={SEVERITIES} onChange={(next) => set(["timeProfiles", "majorEvent", "severity"], next)} />
        </div>
      </Section>

      <Section value="escalation" title="11. Escaladare" description="Mărește sancțiunea după încălcări repetate.">
        <Toggle label="Activează escaladarea" checked={value.escalation.enabled} onChange={(next) => set(["escalation", "enabled"], next)} />
        <NumberField label="Resetare după" help="Zile fără încălcări până la resetarea nivelului (1–3650)." value={value.escalation.resetAfterDays} min={1} max={3650} onChange={(next) => set(["escalation", "resetAfterDays"], next)} />
        <div className="space-y-3">
          {value.escalation.levels.map((level: any, index: number) => (
            <div key={`${level.level}-${index}`} className="grid items-end gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <NumberField label="Nivel" help="1–4" value={level.level} min={1} max={4} onChange={(next) => set(["escalation", "levels", index, "level"], next)} />
              <NumberField label="Încălcări" help="1–10.000" value={level.violations} min={1} max={10000} onChange={(next) => set(["escalation", "levels", index, "violations"], next)} />
              <Choice label="Acțiune" value={level.action} options={ACTIONS} onChange={(next) => set(["escalation", "levels", index, "action"], next)} />
              <Button type="button" variant="outline" size="icon" disabled={value.escalation.levels.length <= 1} aria-label={`Șterge nivelul ${level.level}`} onClick={() => set(["escalation", "levels"], value.escalation.levels.filter((_: any, position: number) => position !== index))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" disabled={value.escalation.levels.length >= 4} onClick={() => set(["escalation", "levels"], [...value.escalation.levels, { level: value.escalation.levels.length + 1, violations: 1, action: "warn" }])}><Plus className="mr-2 h-4 w-4" />Adaugă nivel</Button>
        </div>
      </Section>

      <Section value="embeds" title="12. Embed-uri și aspect" description="Previzualizează mesajul de moderare și configurează animațiile.">
        <Toggle label="Activează embed-uri" checked={value.embeds.enabled} onChange={(next) => set(["embeds", "enabled"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Culoare HEX" help="Format obligatoriu #RRGGBB." value={value.embeds.color} placeholder="#5865F2" onChange={(next) => set(["embeds", "color"], next)} />
          <Choice label="Stil" value={value.embeds.style} options={[["plain", "Simplu"], ["compact", "Compact"], ["detailed", "Detaliat"]]} onChange={(next) => set(["embeds", "style"], next)} />
          <IdField label="URL icon" help="URL HTTPS public pentru icon; lasă gol pentru fără icon." value={value.embeds.iconUrl} onChange={(next) => set(["embeds", "iconUrl"], next)} />
          <Toggle label="Activează animațiile" help="Necesită URL HTTPS către un fișier .gif." checked={value.embeds.animations} onChange={(next) => set(["embeds", "animations"], next)} />
          <IdField label="URL animație GIF" help="URL HTTPS public care se termină în .gif; obligatoriu când animațiile sunt active." value={value.embeds.animationUrl} onChange={(next) => set(["embeds", "animationUrl"], next)} />
        </div>
        <Field label="Titlu mesaj" help="Maximum 200 caractere."><Input value={value.embeds.titleTemplate} maxLength={200} onChange={(event) => set(["embeds", "titleTemplate"], event.target.value)} /></Field>
        <Field label="Descriere mesaj" help="Maximum 2000 caractere; poți folosi {`{action}`} și {`{reason}`} ."><Textarea value={value.embeds.descriptionTemplate} maxLength={2000} onChange={(event) => set(["embeds", "descriptionTemplate"], event.target.value)} /></Field>
        <div className="rounded-lg border border-border bg-background p-4" style={{ borderLeftWidth: 4, borderLeftColor: /^#[0-9a-fA-F]{6}$/.test(value.embeds.color) ? value.embeds.color : undefined }}>
          <div className="flex gap-3">{value.embeds.iconUrl && <img src={value.embeds.iconUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}<div><p className="font-semibold">{value.embeds.titleTemplate.replace("{action}", "Avertisment")}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{value.embeds.descriptionTemplate.replace("{action}", "Avertisment").replace("{reason}", "Exemplu de motiv")}</p></div></div>
          {value.embeds.animations && value.embeds.animationUrl && <img src={value.embeds.animationUrl} alt="Previzualizare animație" className="mt-3 max-h-40 rounded-md" />}
        </div>
      </Section>

      <Section value="permissions" title="13. Permisiuni și izolare" description="Acces la consolă, roluri staff și invarianta de confidențialitate per server.">
        <ListField ids label="Roluri staff" help="Roluri autorizate pentru moderare; un ID pe rând." values={value.permissions.staffRoleIds} onChange={(next) => set(["permissions", "staffRoleIds"], next)} />
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle label="Permite Manage Guild" help="Membrii cu Manage Server primesc acces la comenzile de moderare." checked={value.permissions.allowManageGuild} onChange={(next) => set(["permissions", "allowManageGuild"], next)} />
          <Toggle label="Permite administratorilor setările" help="Permite administratorilor să gestioneze această configurație." checked={value.permissions.allowAdminsSettings} onChange={(next) => set(["permissions", "allowAdminsSettings"], next)} />
          <Toggle label="Multi-server activ" help="Activează funcționarea în mai multe servere." checked={value.multiServer.enabled} onChange={(next) => set(["multiServer", "enabled"], next)} />
          <Toggle label="Date izolate per server" help="Este obligatoriu pentru confidențialitate și nu poate fi dezactivat." checked={true} disabled onChange={() => undefined} />
        </div>
        <TextField label="Prefix bot" help="Comenzile de moderare sunt slash commands; prefixul este fix și nu poate fi schimbat." value="/" disabled onChange={() => undefined} />
      </Section>
    </Accordion>
    </VisibleSections.Provider>
  );
}