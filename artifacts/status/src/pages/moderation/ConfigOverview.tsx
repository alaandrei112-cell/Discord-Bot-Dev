import { useState } from "react";
import { Activity, Bot, ChevronRight, FileText, Gavel, Loader2, MessageSquareWarning, Settings, ShieldAlert, Sparkles, Wrench } from "lucide-react";
import { Link } from "wouter";
import { useActiveGuild, useModerationConfig } from "../../hooks/use-moderation-api";
import { Switch } from "../../components/ui/switch";
import { useToast } from "../../hooks/use-toast";
import { protectionToggleToastOptions } from "../../lib/protection-toggle-feedback";

type ToggleKey = "autoMod" | "antiRaid" | "antiSpam" | "antiFlood" | "suspiciousBehavior" | "ai" | "manualTools" | "cases" | "audit" | "escalation" | "embeds";

export function ConfigOverviewPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, updateProtectionToggle } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState<ToggleKey | null>(null);
  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!data) return <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-destructive">{error?.message || "Configurația nu a putut fi încărcată."}</div>;

  const master = Boolean(data.protection?.enabled);
  const modules: Array<{ key: ToggleKey; title: string; description: string; href: string; enabled: boolean; dependent: boolean; icon: typeof Bot }> = [
    { key: "autoMod", title: "AutoMod", description: "Filtre clasice și sincronizare Discord AutoMod nativ.", href: "/automod", enabled: Boolean(data.autoMod?.enabled), dependent: true, icon: Bot },
    { key: "antiRaid", title: "Anti-Raid", description: "Valuri de intrări și conturi noi.", href: "/anti-raid", enabled: Boolean(data.antiRaid?.enabled), dependent: true, icon: ShieldAlert },
    { key: "antiSpam", title: "Anti-Spam", description: "Mesaje, editări, mențiuni și emoji.", href: "/anti-spam", enabled: Boolean(data.antiSpam?.enabled), dependent: true, icon: MessageSquareWarning },
    { key: "antiFlood", title: "Anti-Flood", description: "Mesaje lungi și șiruri excesive.", href: "/anti-flood", enabled: Boolean(data.antiFlood?.enabled), dependent: true, icon: Activity },
    { key: "suspiciousBehavior", title: "Comportament suspect", description: "Alerte pentru activitate neobișnuită.", href: "/comportament-suspect", enabled: Boolean(data.suspiciousBehavior?.enabled), dependent: true, icon: Sparkles },
    { key: "ai", title: "Moderare AI", description: "Analiză inteligentă separată de AutoMod.", href: "/ai", enabled: Boolean(data.ai?.enabled), dependent: true, icon: Sparkles },
    { key: "manualTools", title: "Unelte staff", description: "Comenzi și permisiuni manuale.", href: "/config/unelte", enabled: Boolean(data.manualTools?.enabled), dependent: false, icon: Wrench },
    { key: "cases", title: "Cazuri", description: "Dosare și drepturi pentru staff.", href: "/config/cazuri-audit", enabled: Boolean(data.cases?.enabled), dependent: false, icon: FileText },
    { key: "audit", title: "Audit", description: "Jurnalul acțiunilor de moderare.", href: "/config/cazuri-audit", enabled: Boolean(data.audit?.enabled), dependent: false, icon: FileText },
    { key: "escalation", title: "Escaladare", description: "Sancțiuni progresive.", href: "/config/escaladare", enabled: Boolean(data.escalation?.enabled), dependent: false, icon: Gavel },
    { key: "embeds", title: "Embed-uri", description: "Aspect, media și animații.", href: "/config/embeduri", enabled: Boolean(data.embeds?.enabled), dependent: false, icon: Settings },
  ];

  const toggle = async (key: ToggleKey, enabled: boolean) => {
    setSaving(key);
    try {
      const result = await updateProtectionToggle(key, enabled);
      toast(protectionToggleToastOptions(enabled, result?.notification?.status));
    } catch (toggleError: any) {
      toast({ variant: "destructive", title: "Modificarea nu a fost salvată", description: toggleError?.message });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-6xl space-y-6 animate-stagger-1">
      <header className="animate-stagger-2"><h1 className="flex items-center gap-3 text-3xl font-bold mod-heading"><Settings className="h-8 w-8 text-primary" />Configurare</h1><p className="mt-2 text-muted-foreground">Activează fiecare modul independent sau deschide setările sale.</p></header>
      {!master && <div role="status" className="animate-stagger-2 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm"><strong>Protecția globală este oprită.</strong> Modulele automate își păstrează setarea, dar sunt momentan în pauză. Le poți configura și activa pentru momentul repornirii.</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-stagger-3">
        {modules.map((module) => {
          const effective = module.enabled && (!module.dependent || master);
          const Icon = module.icon;
          return (
            <article key={module.key} className="mod-card mod-card-interactive flex flex-col p-5">
              <div className="flex items-start justify-between gap-4">
                <Link href={module.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                  <div className={`mb-4 inline-flex rounded-lg border p-2.5 transition-colors ${module.enabled ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-secondary text-muted-foreground"}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="flex items-center gap-2 font-semibold text-foreground">{module.title}<ChevronRight className="h-4 w-4 text-primary/70" /></h2>
                  <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                </Link>
                <div className="pt-2">
                  <Switch aria-label={`${module.enabled ? "Dezactivează" : "Activează"} ${module.title}`} checked={module.enabled} disabled={saving !== null} onClick={(event) => event.stopPropagation()} onCheckedChange={(checked) => void toggle(module.key, checked)} />
                </div>
              </div>
              <p className={`mt-auto pt-4 text-xs font-medium font-mono tracking-wider uppercase ${effective ? "text-primary" : module.enabled ? "text-amber-500" : "text-muted-foreground"}`}>
                {effective ? "Activ" : module.enabled && module.dependent && !master ? "Activat, dar în pauză globală" : "Inactiv"}
              </p>
            </article>
          );
        })}
      </div>
      <div className="animate-stagger-4 pt-4">
        <Link href="/config/avansat" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors font-medium">Toate setările avansate <ChevronRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}