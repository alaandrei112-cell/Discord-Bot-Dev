import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bot, Check, CheckCircle2, ChevronDown, CircleHelp, Clock3, Folder, Hash, LockKeyhole, Megaphone, Play, Radio, RefreshCw, Save, Settings2, ShieldCheck, Ticket, Users, Wrench } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type TabKey = 'channels' | 'tickets' | 'verification' | 'messages' | 'statistics';
type ChannelKey = 'main' | 'event' | 'boss' | 'trader' | 'eventTop' | 'bossTop' | 'council' | 'fratia';
type PermissionState = { roles: string[]; readHistory: boolean; sendMessages: boolean };
type Feedback = 'idle' | 'provisioning' | 'provisioned' | 'saved' | 'tested';
const queryClient = new QueryClient();
const storageKey = 'oracolul-umbrei:channel-control:v1';
const roles = ['Administrator', 'Moderator', 'Cronicar', 'Cavaler al Ordinului'];
const channels = [
  { id: '121708440221', name: 'cufere-si-oracol', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440222', name: 'ora-umbrelor', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440223', name: 'dragonul-stins', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440224', name: 'negustorul', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440225', name: 'clasamente', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440226', name: 'top-dragonul-stins', parent: 'JOC ȘI EVENIMENTE', type: 'text' },
  { id: '121708440231', name: 'consiliul-umbrelor', parent: 'ADMINISTRATOR', type: 'text' },
  { id: '121708440232', name: 'chivotul-fratiei', parent: 'ADMINISTRATOR', type: 'text' },
  { id: '121708440240', name: 'AUDIT', parent: 'ADMINISTRATOR', type: 'category' },
] as const;
const channelFields: { key: ChannelKey; label: string; description: string; icon: typeof Radio }[] = [
  { key: 'main', label: 'Cufere și Oracol', description: 'Recompense, chei și mesajele Oracolului', icon: Radio },
  { key: 'event', label: 'Ora Umbrelor', description: 'Anunțuri și rezultate pentru eveniment', icon: Clock3 },
  { key: 'boss', label: 'Dragonul Stins', description: 'Lupte, damage și clasament de boss', icon: ShieldCheck },
  { key: 'trader', label: 'Negustorul', description: 'Oferte și rotația comerciantului', icon: Settings2 },
  { key: 'eventTop', label: 'Top Ora Umbrelor', description: 'Clasamentul ultimului eveniment', icon: Activity },
  { key: 'bossTop', label: 'Top Dragonul Stins', description: 'Clasamentul permanent de boss', icon: Activity },
  { key: 'council', label: 'Consiliul Umbrelor', description: 'Comenzi administrative și audit', icon: LockKeyhole },
  { key: 'fratia', label: 'Chivotul Frăției', description: 'Mesaje și alerte pentru frăție', icon: Users },
];
const categories = [
  { key: 'gameplay', label: 'Joc și evenimente', description: 'Fluxurile care țin serverul activ și informativ.', items: ['Cufere și Oracol', 'Ora Umbrelor', 'Dragonul Stins', 'Negustorul', 'Clasamente'] },
  { key: 'admin', label: 'Administrator', description: 'Instrumente private pentru echipă și audit.', items: ['Consiliul Umbrelor', 'Chivotul Frăției', 'Tichete', 'Audit'] },
  { key: 'filtered', label: 'Mesaje filtrate', description: 'Jurnale pentru anti-spam și moderarea AI.', items: ['Jurnal anti-spam', 'Jurnal moderare AI'] },
  { key: 'links', label: 'Linkuri', description: 'Destinație pentru mesajele cu linkuri filtrate.', items: ['Categorie Linkuri'] },
  { key: 'security', label: 'Securitate', description: 'Alerte anti-raid și comportament suspect.', items: ['Alerte anti-raid', 'Alerte comportament suspect'] },
  { key: 'verification', label: 'Verificare', description: 'Spațiul pentru verificarea membrilor noi.', items: ['Canal verificare'] },
] as const;
const defaultSelected: Record<ChannelKey, string> = { main: channels[0].id, event: channels[1].id, boss: channels[2].id, trader: channels[3].id, eventTop: channels[4].id, bossTop: channels[5].id, council: channels[6].id, fratia: channels[7].id };
const defaultPermissions: Record<string, PermissionState> = Object.fromEntries(categories.map((c) => [c.key, { roles: c.key === 'admin' ? ['Administrator', 'Moderator'] : ['Moderator'], readHistory: true, sendMessages: c.key !== 'filtered' }]));
const moduleCopy = {
  tickets: {
    eyebrow: 'TICKET OPS',
    label: 'Tichete Discord',
    description: 'Configurează fluxul de suport și urmărește starea tichetelor fără să pierzi contextul.',
    icon: Ticket,
    metrics: [['Deschise', '4', 'Necesită atenție'], ['În așteptare', '2', 'Așteaptă răspuns'], ['Rezolvate', '18', 'În ultimele 30 zile']],
    rows: [['#1042', 'Raportare comportament', 'Moderator', 'Acum 8 min'], ['#1041', 'Întrebare despre eveniment', 'Cronicar', 'Acum 24 min'], ['#1038', 'Acces rol verificat', 'Administrator', 'Ieri']],
  },
  verification: {
    eyebrow: 'MEMBER GATE',
    label: 'Verificare membri',
    description: 'Pregătește verificarea membrilor noi și păstrează vizibil progresul fluxului.',
    icon: ShieldCheck,
    metrics: [['În așteptare', '12', 'Membri noi'], ['Verificați azi', '27', 'Flux finalizat'], ['Rată reușită', '94%', 'Ultimele 7 zile']],
    rows: [['Canal verificare', 'Activ și conectat', 'Public', 'Pregătit'], ['Rol după verificare', 'Membru', 'Automat', 'Pregătit'], ['Mesaj de întâmpinare', 'Configurat', 'Oracol', 'Pregătit']],
  },
  messages: {
    eyebrow: 'MESSAGE ROUTING',
    label: 'Mesaje automate',
    description: 'Verifică destinațiile și starea mesajelor automate trimise de bot.',
    icon: Megaphone,
    metrics: [['Trimise azi', '86', 'Toate destinațiile'], ['În coadă', '3', 'Vor fi trimise curând'], ['Eșecuri', '0', 'Ultimele 24 ore']],
    rows: [['Oracol și cufere', 'cufere-si-oracol', 'Activ', 'Postare automată'], ['Ora Umbrelor', 'ora-umbrelor', 'Activ', 'Postare automată'], ['Negustorul', 'negustorul', 'Activ', 'Rotație zilnică']],
  },
  statistics: {
    eyebrow: 'BOT PULSE',
    label: 'Statistici bot',
    description: 'O privire rapidă asupra activității botului și a sănătății destinațiilor configurate.',
    icon: Activity,
    metrics: [['Mesaje procesate', '1.284', 'Ultimele 30 zile'], ['Evenimente active', '7', 'În acest moment'], ['Disponibilitate', '99,2%', 'Ultimele 7 zile']],
    rows: [['Activitate evenimente', '82%', 'Ritm normal', 'Acum'], ['Răspunsuri Oracol', '68%', 'În creștere', 'Săptămâna aceasta'], ['Destinații sănătoase', '8/8', 'Totul funcționează', 'Verificat acum']],
  },
} as const;

function PermissionPanel({ category, permission, onChange }: { category: (typeof categories)[number]; permission: PermissionState; onChange: (p: PermissionState) => void }) {
  const toggleRole = (role: string) => onChange({ ...permission, roles: permission.roles.includes(role) ? permission.roles.filter((r) => r !== role) : [...permission.roles, role] });
  return <div className="permission-panel" data-testid={`panel-permissions-${category.key}`}><div className="permission-title"><LockKeyhole size={15} /><div><strong>Permisiuni pentru {category.label}</strong><p>Membrii cu rolurile selectate văd canalele create. Botul își păstrează accesul automat.</p></div></div><div className="role-grid">{roles.map((role) => <label className="permission-check" key={role}><input type="checkbox" checked={permission.roles.includes(role)} onChange={() => toggleRole(role)} data-testid={`checkbox-role-${category.key}-${role.replaceAll(' ', '-').toLowerCase()}`} /><Users size={12} />@{role}</label>)}</div><div className="permission-options"><label><input type="checkbox" checked={permission.readHistory} onChange={(e) => onChange({ ...permission, readHistory: e.target.checked })} data-testid={`checkbox-history-${category.key}`} /> Pot vedea istoricul</label><label><input type="checkbox" checked={permission.sendMessages} onChange={(e) => onChange({ ...permission, sendMessages: e.target.checked })} data-testid={`checkbox-send-${category.key}`} /> Pot scrie mesaje</label></div></div>;
}

function ModulePanel({ tab, ready, onToggle, onBack }: { tab: Exclude<TabKey, 'channels'>; ready: boolean; onToggle: () => void; onBack: () => void }) {
  const copy = moduleCopy[tab];
  const Icon = copy.icon;
  return <section className="module-shell surface" data-testid={`tab-panel-${tab}`}>
    <div className="module-header">
      <div className="section-title"><span className="icon-box"><Icon size={16} /></span><div><span className="eyebrow">{copy.eyebrow}</span><h2>{copy.label}</h2><p>{copy.description}</p></div></div>
      <div className={`module-status ${ready ? 'ready' : ''}`} data-testid={`status-module-${tab}`}><span className="status-dot" />{ready ? 'Pregătit local' : 'În configurare'}</div>
    </div>
    <div className="module-metrics">
      {copy.metrics.map(([label, value, detail]) => <div className="metric-card" key={label} data-testid={`metric-${tab}-${label.toLowerCase().replaceAll(' ', '-')}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}
    </div>
    <div className="module-workspace">
      <div className="module-list surface-inset">
        <div className="module-list-head"><div><span className="eyebrow">CONFIGURAȚIE</span><h3>Fluxuri urmărite</h3></div><CheckCircle2 size={17} /></div>
        {copy.rows.map(([name, value, owner, time], index) => <div className="module-row" key={name} data-testid={`row-${tab}-${index}`}><div className="module-row-icon"><Icon size={14} /></div><div className="module-row-main"><strong>{name}</strong><span>{value}</span></div><span className="module-row-owner">{owner}</span><small>{time}</small></div>)}
      </div>
      <aside className="module-side surface-inset">
        <span className="eyebrow">CONTROL LOCAL</span><h3>Stare modul</h3><p>Acest spațiu folosește aceeași configurație owner-only ca zona de canale.</p>
        <div className="module-check"><Check size={13} /> Configurația poate fi pregătită</div>
        <div className="module-check"><Clock3 size={13} /> Se aplică după reconectarea botului</div>
        <button type="button" className={`btn ${ready ? 'primary' : ''}`} onClick={onToggle} data-testid={`button-toggle-module-${tab}`}>{ready ? <Check size={14} /> : <Clock3 size={14} />}{ready ? 'Pregătit' : 'Marchează pregătit'}</button>
      </aside>
    </div>
    <button type="button" className="module-back" onClick={onBack} data-testid={`button-return-to-channels-${tab}`}><Radio size={13} /> Înapoi la canale</button>
  </section>;
}

function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('channels');
  const [selected, setSelected] = useState(defaultSelected);
  const [chosen, setChosen] = useState<string[]>(['gameplay', 'admin']);
  const [expanded, setExpanded] = useState<string | null>('gameplay');
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [moduleReady, setModuleReady] = useState<Record<Exclude<TabKey, 'channels'>, boolean>>({ tickets: false, verification: false, messages: false, statistics: false });
  const [hydrated, setHydrated] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  useEffect(() => { try { const raw = localStorage.getItem(storageKey); if (raw) { const v = JSON.parse(raw); setSelected({ ...defaultSelected, ...v.selected }); setChosen(v.chosen ?? chosen); setPermissions({ ...defaultPermissions, ...v.permissions }); } } catch { /* unavailable */ } setHydrated(true); }, []);
  const snapshot = useMemo(() => JSON.stringify({ selected, chosen, permissions }), [selected, chosen, permissions]);
  useEffect(() => { if (hydrated && !savedSnapshot) setSavedSnapshot(snapshot); }, [hydrated, savedSnapshot, snapshot]);
  const dirty = hydrated && snapshot !== savedSnapshot;
  const errors = useMemo(() => { const result: Partial<Record<ChannelKey, string>> = {}; const seen = new Map<string, ChannelKey>(); channelFields.forEach(({ key }) => { const value = selected[key]; if (!value) return; if (!/^\d{12,20}$/.test(value)) result[key] = 'ID-ul trebuie să conțină 12–20 cifre.'; else if (seen.has(value)) result[key] = `Duplicat cu „${channelFields.find((f) => f.key === seen.get(value))?.label}”.`; else seen.set(value, key); }); return result; }, [selected]);
  const setFeedbackFor = (next: Feedback, duration = 2200) => { setFeedback(next); window.setTimeout(() => setFeedback('idle'), duration); };
  const provision = () => { setFeedbackFor('provisioning', 1150); window.setTimeout(() => setFeedbackFor('provisioned'), 1150); };
  const save = () => { if (Object.keys(errors).length) { setFeedbackFor('tested'); return; } try { localStorage.setItem(storageKey, snapshot); } catch { /* unavailable */ } setSavedSnapshot(snapshot); setFeedbackFor('saved'); };
  const tabs: { key: TabKey; label: string; icon: typeof Radio }[] = [{ key: 'channels', label: 'Canale', icon: Radio }, { key: 'tickets', label: 'Tichete', icon: Ticket }, { key: 'verification', label: 'Verificare', icon: ShieldCheck }, { key: 'messages', label: 'Mesaje', icon: Megaphone }, { key: 'statistics', label: 'Statistici', icon: Activity }];
  return <main className={`control-app ${dirty ? 'has-unsaved-changes' : ''}`}><div className="atmosphere" aria-hidden="true"><span className="fire-glow fire-glow-left" /><span className="fire-glow fire-glow-right" /><span className="smoke smoke-one" /><span className="smoke smoke-two" /><span className="smoke smoke-three" /><span className="flame flame-one" /><span className="flame flame-two" /><span className="flame flame-three" /><span className="flame flame-four" /><span className="flame flame-five" /><span className="spark spark-one" /><span className="spark spark-two" /></div><div className="shell">
    <header className="hero"><div><div className="brand-row"><span className="brand-mark"><Bot size={18} /></span><span className="eyebrow">CONTROL OWNER-ONLY</span></div><h1>Control bot</h1><p className="subtitle">Configurează destinațiile Discord și regulile de creare fără să pierzi din vedere ce se schimbă.</p></div><div className="bot-status"><span className="status-pulse" /><div><strong>Bot deconectat</strong><small>Ultima verificare acum 4 min</small></div></div></header>
    <div className="offline-banner"><AlertTriangle size={15} /><span><strong>Modificările rămân în așteptare.</strong> Botul Discord nu este conectat la această instanță. Salvarea este disponibilă acum, iar setările devin active după reconectare.</span><button type="button" onClick={() => setFeedbackFor('tested')} data-testid="button-view-connection-help"><CircleHelp size={13} /> Detalii</button></div>
    <nav className="tab-bar" aria-label="Secțiuni control bot">{tabs.map(({ key, label, icon: Icon }) => <button type="button" className="tab" data-active={activeTab === key} data-testid={`tab-${key}`} key={key} onClick={() => setActiveTab(key)}><Icon size={14} />{label}</button>)}</nav>
     {activeTab !== 'channels' ? <ModulePanel tab={activeTab} ready={moduleReady[activeTab]} onToggle={() => { setModuleReady((current) => ({ ...current, [activeTab]: !current[activeTab] })); setFeedbackFor('tested'); }} onBack={() => setActiveTab('channels')} /> :
    <section className="content-grid" data-testid="tab-panel-channels"><div className="main-column"><section className="surface destinations"><div className="section-head"><div className="section-title"><span className="icon-box"><Radio size={16} /></span><div><div className="title-line"><h2>Destinații de canal</h2><span className="count-pill">{Object.values(selected).filter(Boolean).length}/8 configurate</span></div><p>Alege un canal existent sau introdu manual ID-ul Discord. Fiecare flux are o destinație vizibilă aici.</p></div></div><button type="button" className="btn outline" onClick={provision} disabled={feedback === 'provisioning'} data-testid="button-provision-channels"><RefreshCw size={13} className={feedback === 'provisioning' ? 'spin' : ''} />{feedback === 'provisioning' ? 'Se sincronizează' : feedback === 'provisioned' ? 'Destinații verificate' : 'Creează ce lipsește'}</button></div><div className="channel-grid">{channelFields.map(({ key, label, description, icon: Icon }) => { const value = selected[key]; const current = channels.find((c) => c.id === value); return <article className={`destination-card ${value ? 'selected' : ''} ${errors[key] ? 'has-error' : ''}`} key={key} data-testid={`card-channel-${key}`}><div className="destination-head"><Icon size={15} /><div><label htmlFor={`channel-${key}`}>{label}</label><p>{description}</p></div>{value && <CheckCircle2 size={14} />}</div><select value={value} onChange={(e) => setSelected({ ...selected, [key]: e.target.value })} data-testid={`select-channel-${key}`}><option value="">Neconfigurat</option>{channels.map((c) => <option value={c.id} key={c.id}>{c.type === 'category' ? 'Categorie' : '#'} {c.name} · {c.parent} ({c.id})</option>)}</select><div className="id-row"><Hash size={13} /><input id={`channel-${key}`} value={value} onChange={(e) => setSelected({ ...selected, [key]: e.target.value.trim() })} placeholder="ID canal Discord" aria-label={`${label} ID`} data-testid={`input-channel-id-${key}`} /><span>{current ? `#${current.name}` : 'ID manual'}</span></div>{errors[key] && <p className="field-error" data-testid={`validation-channel-${key}`}>{errors[key]}</p>}</article>; })}</div></section>
    <section className="surface permissions"><div className="section-title"><span className="icon-box amber"><ShieldCheck size={16} /></span><div><h2>Permisiuni necesare</h2><p>Verifică accesul botului înainte de provisioning pentru a evita categorii create incomplet.</p></div></div><div className="permission-summary"><span>Manage Channels <b>⚠ Necesară</b></span><span>Manage Permissions <b>⚠ Necesară</b></span><span>Send Messages <em>✓ Disponibilă</em></span></div><p className="help"><CircleHelp size={13} /> Butonul de provisioning va rămâne blocat pe Discord până când botul primește permisiunea <strong>Manage Channels</strong>.</p></section></div>
    <aside className="provision-panel" data-testid="panel-provisioning"><div className="panel-heading"><div><span className="eyebrow">PROVISIONING</span><h2>Ce se creează</h2></div><span className="count-pill">{chosen.length}/{categories.length}</span></div><p>Selectează doar categoriile pe care botul are voie să le pregătească. Celelalte nu sunt atinse.</p><div className="category-list">{categories.map((category) => { const isSelected = chosen.includes(category.key); const open = expanded === category.key; return <div className={`category-row ${isSelected ? 'selected' : ''}`} key={category.key} data-testid={`row-category-${category.key}`}><div className="category-top"><input type="checkbox" checked={isSelected} onChange={(e) => { setChosen(e.target.checked ? [...chosen, category.key] : chosen.filter((k) => k !== category.key)); if (e.target.checked) setExpanded(category.key); }} data-testid={`checkbox-category-${category.key}`} /><button type="button" onClick={() => setExpanded(open ? null : category.key)} data-testid={`button-expand-category-${category.key}`}><Folder size={13} /> <strong>{category.label}</strong><small>{category.items.length} destinații · {category.description}</small></button><ChevronDown size={13} className={open ? 'rotate' : ''} /></div>{open && isSelected && <div className="category-details"><div className="item-tags">{category.items.map((item) => <span key={item}>{item}</span>)}</div><PermissionPanel category={category} permission={permissions[category.key]} onChange={(p) => setPermissions({ ...permissions, [category.key]: p })} /></div>}</div>; })}</div><div className="panel-actions"><button type="button" className="btn quiet" onClick={() => setChosen(categories.map((c) => c.key))} data-testid="button-select-all-categories">Toate</button><button type="button" className="btn quiet" onClick={() => setChosen([])} data-testid="button-clear-categories">Niciuna</button></div></aside></section>}
    {dirty && <div className="inline-save-actions"><div className="save-state"><span className="status-dot" /><span>Ai modificări locale nesalvate.</span></div><div className="footer-actions"><button type="button" className="btn" onClick={() => setFeedbackFor('tested')} data-testid="button-test-flow"><Play size={13} /> Testează fluxul</button><button type="button" className="btn primary" onClick={save} data-testid="button-save-bot-control"><Save size={13} /> Salvează controlul botului</button></div></div>}
  </div></main>;
}
function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;