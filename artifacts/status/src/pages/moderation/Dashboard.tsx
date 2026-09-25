import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  History,
  Settings,
  Shield,
  ShieldAlert,
  Server,
  PauseCircle,
  PlayCircle,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useModerationConfig, useCases, useActiveGuild, useAuditLogs, useGameplayState } from "../../hooks/use-moderation-api";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { protectionToggleToastOptions } from "../../lib/protection-toggle-feedback";
import { presentAuditActor, presentAuditLog } from "../../lib/moderation-audit";

type ProtectionModuleKey = "autoMod" | "wordFilter" | "linkBlock" | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai";

export function DashboardOverview() {
  const { guildId, guilds } = useActiveGuild();
  const { data: config, loading: configLoading, update: updateModerationConfig, updateProtectionToggle, refetch: refetchModerationConfig } = useModerationConfig(guildId);
  const { data: casesData, loading: casesLoading } = useCases(guildId, { limit: 10 });
  const { data: auditLogs, loading: auditLoading } = useAuditLogs(guildId);
  const { paused: gamePaused, loading: gameStateLoading, update: updateGameState } = useGameplayState(guildId);
  const { toast } = useToast();
  const [savingModule, setSavingModule] = useState<string | null>(null);
  const [savingGameState, setSavingGameState] = useState(false);
  const [optimisticConfig, setOptimisticConfig] = useState<any>(null);
  const [deactivatingKey, setDeactivatingKey] = useState<string | null>(null);
  const activeGuild = guilds.find((guild) => guild.id === guildId);
  const activeGuildIcon = activeGuild?.icon
    ? (/^https?:\/\//i.test(activeGuild.icon)
      ? activeGuild.icon
      : `https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.png?size=128`)
    : null;

  if (!guildId) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/30 p-8 text-center text-muted-foreground">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Shield className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mod-eyebrow">Niciun server activ</p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed">Selectează un server din meniul lateral pentru a deschide tabloul de operațiuni.</p>
      </div>
    );
  }

  if (configLoading || casesLoading || auditLoading) {
    return (
      <div className="space-y-7" aria-label="Se încarcă datele dashboardului">
        <div className="space-y-3">
          <div className="mod-skeleton h-3 w-32" />
          <div className="mod-skeleton h-12 w-72" />
          <div className="mod-skeleton h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="mod-card h-36 rounded-2xl p-6"><div className="mod-skeleton h-full w-full" /></div>)}
        </div>
        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <div className="mod-card h-80 rounded-2xl" />
          <div className="mod-card h-80 rounded-2xl" />
        </div>
        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">SE INIȚIALIZEAZĂ DATELE...</p>
      </div>
    );
  }

  const openCases = (casesData || []).filter((item) => item.status === "open").length;
  const recentLogs = (auditLogs || []).slice(0, 7);
  const visibleConfig = optimisticConfig ?? config;
  const protectionEnabled = visibleConfig?.protection?.enabled ?? true;
  const modules = [
    { key: "autoMod" as const, name: "AutoMod", description: "Filtre clasice și sincronizare Discord AutoMod nativ.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled), enabled: Boolean(visibleConfig?.autoMod?.enabled), parentEnabled: true, icon: Bot },
    { key: "wordFilter" as const, name: "Filtru cuvinte", description: "Cuvinte interzise și acțiunea aplicată la detectare.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled && visibleConfig?.autoMod?.wordFilter?.enabled), enabled: Boolean(visibleConfig?.autoMod?.wordFilter?.enabled), parentEnabled: Boolean(visibleConfig?.autoMod?.enabled), icon: BookOpen },
    { key: "linkBlock" as const, name: "Blocare linkuri", description: "Linkuri interzise și răspunsul automat asociat.", href: "/automod", active: Boolean(protectionEnabled && visibleConfig?.autoMod?.enabled && visibleConfig?.autoMod?.linkBlock?.enabled), enabled: Boolean(visibleConfig?.autoMod?.linkBlock?.enabled), parentEnabled: Boolean(visibleConfig?.autoMod?.enabled), icon: Zap },
    { key: "antiRaid" as const, name: "Anti-Raid", description: "Valuri de intrări și conturi prea noi.", href: "/anti-raid", active: Boolean(protectionEnabled && visibleConfig?.antiRaid?.enabled), enabled: Boolean(visibleConfig?.antiRaid?.enabled), parentEnabled: true, icon: ShieldAlert },
    { key: "antiSpam" as const, name: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji repetitive.", href: "/anti-spam", active: Boolean(protectionEnabled && visibleConfig?.antiSpam?.enabled), enabled: Boolean(visibleConfig?.antiSpam?.enabled), parentEnabled: true, icon: Activity },
    { key: "antiFlood" as const, name: "Anti-Flood", description: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", active: Boolean(protectionEnabled && visibleConfig?.antiFlood?.enabled), enabled: Boolean(visibleConfig?.antiFlood?.enabled), parentEnabled: true, icon: Activity },
    { key: "suspiciousBehavior" as const, name: "Comportament suspect", description: "Alerte pentru activitate și schimbări neobișnuite.", href: "/comportament-suspect", active: Boolean(protectionEnabled && visibleConfig?.suspiciousBehavior?.enabled), enabled: Boolean(visibleConfig?.suspiciousBehavior?.enabled), parentEnabled: true, icon: ShieldAlert },
    { key: "ai" as const, name: "Moderare AI", description: "Analiză inteligentă separată de AutoMod.", href: "/ai", active: Boolean(protectionEnabled && visibleConfig?.ai?.enabled), enabled: Boolean(visibleConfig?.ai?.enabled), parentEnabled: true, icon: Bot },
  ];

  const saveProtectionChange = async (
    change: (current: any) => any,
    key: string,
    description: string,
    toggleKey?: "protection" | ProtectionModuleKey,
    enabled?: boolean,
  ) => {
    if (!config || savingModule) return;
    setSavingModule(key);
    const nextConfig = change(config);
    setOptimisticConfig(nextConfig);
    try {
      let toggleResult: any;
      if (toggleKey && enabled !== undefined) {
        toggleResult = await updateProtectionToggle(toggleKey, enabled);
      } else {
        await updateModerationConfig(nextConfig);
      }
      setOptimisticConfig(null);
      toast(toggleKey && enabled !== undefined
        ? protectionToggleToastOptions(enabled, toggleResult?.notification?.status, description)
        : { title: "Setare actualizată", description });
    } catch (error: any) {
      if (String(error?.message ?? "").includes("Conflict de versiune")) {
        try {
          const freshConfig = await refetchModerationConfig();
          if (freshConfig) {
            const retriedConfig = change(freshConfig);
            setOptimisticConfig(retriedConfig);
            let retryToggleResult: any;
            if (toggleKey && enabled !== undefined) {
              retryToggleResult = await updateProtectionToggle(toggleKey, enabled);
            } else {
              await updateModerationConfig(retriedConfig);
            }
            setOptimisticConfig(null);
            toast(toggleKey && enabled !== undefined
              ? protectionToggleToastOptions(enabled, retryToggleResult?.notification?.status, description)
              : { title: "Setare actualizată", description });
            return;
          }
        } catch (retryError: any) {
          error = retryError;
        }
      }
      toast({
        variant: "destructive",
        title: "Setarea nu a putut fi salvată",
        description: error?.message ?? "Încearcă din nou.",
      });
      setOptimisticConfig(null);
    } finally {
      setSavingModule(null);
    }
  };

  const toggleProtection = (enabled: boolean) => {
    if (!config) return;
    if (!enabled) {
      setDeactivatingKey("protection");
      window.setTimeout(() => setDeactivatingKey((current) => current === "protection" ? null : current), 700);
    }
    void saveProtectionChange(
      (current) => ({ ...current, protection: { ...current.protection, enabled } }),
      "protection",
      enabled ? "Toate modulele de protecție sunt disponibile." : "Toate modulele de protecție sunt oprite.",
      "protection",
      enabled,
    );
  };

  const toggleModule = (key: ProtectionModuleKey, enabled: boolean) => {
    if (!config) return;
    if (!enabled) {
      setDeactivatingKey(key);
      window.setTimeout(() => setDeactivatingKey((current) => current === key ? null : current), 700);
    }
    void saveProtectionChange((current) => {
      const nextConfig = { ...current };
      if (key === "wordFilter" || key === "linkBlock") {
        nextConfig.autoMod = {
          ...current.autoMod,
          enabled: enabled ? true : current.autoMod?.enabled,
          [key]: { ...current.autoMod?.[key], enabled },
        };
      } else if (key === "autoMod") {
        nextConfig.autoMod = { ...current.autoMod, enabled };
      } else {
        nextConfig[key] = { ...current[key], enabled };
      }
      return nextConfig;
    }, key, `${key} este acum ${enabled ? "activ" : "oprit"}.`, key, enabled);
  };

  const toggleGameState = async () => {
    const nextPaused = !gamePaused;
    if (nextPaused && !window.confirm("Oprești activitățile jocului pe acest server? Evenimentele, luptele și recompensele vor fi suspendate.")) return;
    setSavingGameState(true);
    try {
      await updateGameState(nextPaused);
      toast({
        title: nextPaused ? "Joc oprit" : "Joc repornit",
        description: nextPaused
          ? "Activitățile jocului sunt suspendate. Oracle AI rămâne separat și nu este oprit."
          : "Activitățile jocului pot porni din nou.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Starea jocului nu a putut fi schimbată", description: error?.message ?? "Încearcă din nou." });
    } finally {
      setSavingGameState(false);
    }
  };

  return (
    <div className="space-y-8 pb-10 animate-stagger-1">
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex w-full max-w-sm items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/80 to-background/80 px-3 py-3 shadow-lg transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_20px_rgba(214,84,81,0.15)]"
        title={`Deschide invitația ${activeGuild?.name || "serverului"}`}
        data-testid="link-dashboard-server-invite"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/40 bg-background/80 text-primary shadow-inner relative">
          <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors" />
          {activeGuildIcon ? (
            <img
              src={activeGuildIcon}
              alt=""
              className="h-full w-full object-cover relative z-10"
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
          ) : (
            <Server className="h-6 w-6 relative z-10" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-primary/80">Serverul oficial</span>
          <strong className="block truncate font-display text-lg font-medium text-foreground">{activeGuild?.name || "Serverul meu"}</strong>
          <span className="block truncate font-mono text-[10px] tracking-wider text-muted-foreground">{DISCORD_INVITE.replace(/^https?:\/\//, "")}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </a>

      <header className="flex flex-col gap-5 border-b border-border/60 pb-7 md:flex-row md:items-end md:justify-between animate-stagger-2">
        <div>
          <div className="mod-status-line mb-3">Sesiune autentificată</div>
          <h1 className="mod-heading text-5xl text-foreground sm:text-6xl">{activeGuild?.name || "Dashboard"}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Consola operatorului pentru gestionarea securității. Orice modificare se aplică instantaneu în regat.
          </p>
        </div>
        <Link href="/config" data-testid="link-dashboard-settings" className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10">
          <Settings className="h-4 w-4 text-primary" aria-hidden="true" /> Configurare <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Link>
      </header>

      <section className={`animate-stagger-3 flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 ${gamePaused ? "border-destructive/40 bg-destructive/5" : "border-primary/25 bg-primary/5"}`} aria-label="Control stare joc">
        <div className="flex items-start gap-4">
          <span className={`mt-0.5 rounded-xl p-3 ${gamePaused ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
            {gamePaused ? <PlayCircle className="h-5 w-5" aria-hidden="true" /> : <PauseCircle className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div>
            <p className="mod-eyebrow">{gamePaused ? "Joc suspendat" : "Joc activ"}</p>
            <h2 className="mt-1 font-display text-2xl text-foreground">{gamePaused ? "Activitățile sunt oprite" : "Regatul rulează normal"}</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {gamePaused
                ? "Evenimentele, luptele, cuferele și recompensele sunt blocate până la repornire."
                : "Poți suspenda temporar activitățile jocului fără să oprești moderarea sau Oracle AI."}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={gamePaused ? "default" : "destructive"}
          className="shrink-0 gap-2"
          onClick={() => void toggleGameState()}
          disabled={gameStateLoading || savingGameState}
        >
          {gamePaused ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
          {savingGameState ? "Se schimbă..." : gamePaused ? "Pornește jocul" : "Oprește jocul"}
        </Button>
      </section>

      <section aria-label="Indicatori principali" className="grid gap-4 md:grid-cols-3 animate-stagger-4">
        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Cazuri deschise</span>
            <span className={`rounded-lg p-2.5 ${openCases > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-5xl font-semibold text-foreground">{openCases}</strong>
            <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> revizuire</span>
          </div>
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${openCases ? "w-2/3 bg-destructive" : "w-1/4 bg-primary"}`} /></div>
        </div>

        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Scut AutoMod</span>
            <span className={`rounded-lg p-2.5 ${protectionEnabled && visibleConfig?.autoMod?.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}><Shield className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-4xl font-semibold text-foreground">{protectionEnabled && visibleConfig?.autoMod?.enabled ? "Activ" : "Oprit"}</strong>
            <span className="mb-1 text-xs text-muted-foreground">monitorizare live</span>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${protectionEnabled && visibleConfig?.autoMod?.enabled ? "bg-primary" : "bg-muted-foreground"}`} /> reguli clasice</div>
        </div>

        <div className="mod-card group rounded-2xl p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <span className="mod-eyebrow text-muted-foreground">Loguri audit azi</span>
            <span className="rounded-lg bg-secondary p-2.5 text-primary"><Activity className="h-4 w-4" aria-hidden="true" /></span>
          </div>
          <div className="mt-7 flex items-end justify-between gap-3">
            <strong className="font-display text-5xl font-semibold text-foreground">{auditLogs?.length || 0}</strong>
            <span className="mb-1 text-xs text-muted-foreground">evenimente</span>
          </div>
          <div className="mt-5 flex h-1 items-end gap-1" aria-hidden="true">
            {[35, 58, 42, 76, 48, 86, 63, 72, 54, 92, 68, 80].map((height, index) => <span key={index} className="flex-1 rounded-full bg-primary/60" style={{ height: `${height}%` }} />)}
          </div>
        </div>
      </section>

      <div data-testid="dashboard-columns" className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] animate-stagger-5">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Sisteme</p><h2 className="mod-heading mt-1 text-2xl">Module de Protecție</h2></div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer group">
                <span className="group-hover:text-foreground transition-colors">{protectionEnabled ? "ACTIVĂ" : "OPRITĂ"}</span>
                <Switch
                  checked={protectionEnabled}
                  onCheckedChange={toggleProtection}
                  className={deactivatingKey === "protection" ? "protection-deactivating" : undefined}
                  disabled={savingModule !== null}
                  aria-label="Activează sau oprește toată protecția"
                />
              </label>
              <Link href="/protectie" data-testid="link-dashboard-protection" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80 transition-colors">GESTIONEAZĂ <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="grid gap-3 2xl:grid-cols-2">
            {modules.map((mod) => (
              <article key={mod.key} className={`mod-card mod-card-interactive flex min-w-0 items-start gap-3 p-4 ${deactivatingKey === mod.key ? "protection-deactivating" : ""}`} data-testid={`card-module-${mod.key}`}>
                <div className={`shrink-0 rounded-lg border p-2.5 transition-colors ${mod.active ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}><mod.icon className="h-4 w-4" aria-hidden="true" /></div>
                <Link href={mod.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" data-testid={`link-module-${mod.key}`}>
                  <h3 className="flex items-center gap-1 text-sm font-medium leading-snug text-foreground">{mod.name}<ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" /></h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
                  <p className={`mt-2 flex items-center gap-1 font-mono text-[10px] tracking-wider ${mod.active ? "text-primary" : mod.enabled ? "text-amber-500" : "text-muted-foreground"}`}>
                    {mod.active ? <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" /> : mod.enabled ? <PauseCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> : <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    {mod.active ? "ACTIV" : mod.enabled && !protectionEnabled ? "CONFIGURAT · PROTECȚIA GLOBALĂ OPRITĂ" : mod.enabled && !mod.parentEnabled ? "CONFIGURAT · AUTOMOD OPRIT" : "INACTIV"}
                  </p>
                </Link>
                <div className="pt-1">
                  <Switch
                    checked={mod.enabled}
                    onCheckedChange={(enabled) => toggleModule(mod.key, enabled)}
                    className={deactivatingKey === mod.key ? "protection-deactivating" : undefined}
                    disabled={savingModule !== null}
                    aria-label={`${mod.enabled ? "Dezactivează" : "Activează"} ${mod.name}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="flex items-end justify-between border-b border-border/60 pb-3">
            <div><p className="mod-eyebrow">Jurnal</p><h2 className="mod-heading mt-1 text-2xl">Activitate Recentă</h2></div>
            <Link href="/audit" data-testid="link-dashboard-audit" className="inline-flex items-center gap-1 text-xs font-mono tracking-widest text-primary hover:text-primary/80 transition-colors">VEZI TOT <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </div>
          <div className="mod-card overflow-hidden p-1.5 shadow-lg shadow-black/40">
            {recentLogs.length > 0 ? (
              <div className="divide-y divide-border/40">
                {recentLogs.map((log: any, index: number) => (
                  <div key={log.id} className="flex gap-3 rounded-xl p-3.5 transition-colors hover:bg-secondary/45 group" data-testid={`row-dashboard-audit-${index}`}>
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/10 group-hover:ring-primary/20 transition-all" />
                    {(() => {
                      const presentation = presentAuditLog(log);
                      return (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            <strong className="font-medium text-foreground">{presentAuditActor(log)}</strong>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-primary">{presentation.title}</span>
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{presentation.details}</p>
                        </div>
                      );
                    })()}
                    <time className="shrink-0 font-mono text-[10px] text-muted-foreground" dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground"><History className="h-8 w-8 opacity-30" aria-hidden="true" /><span className="font-mono text-[10px] tracking-[0.16em]">NICIO ACTIVITATE ÎNREGISTRATĂ RECENT.</span></div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}