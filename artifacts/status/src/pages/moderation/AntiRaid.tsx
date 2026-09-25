import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, ShieldAlert } from "lucide-react";
import { useActiveGuild, useModerationConfig, useModerationMetadata } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { useToast } from "../../hooks/use-toast";
import { configSaveToastOptions } from "../../lib/protection-toggle-feedback";

const isTextChannel = (type: number | string) => String(type) === "0" || type === "GuildText";

export function AntiRaidPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { data: metadata } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [initializedGuild, setInitializedGuild] = useState<string | null>(null);

  useEffect(() => {
    if (data && guildId && initializedGuild !== guildId) {
      setDraft(JSON.parse(JSON.stringify(data)));
      setInitializedGuild(guildId);
    }
  }, [data, guildId, initializedGuild]);

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!draft) {
    return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{error?.message || "Configurația anti-raid nu a putut fi încărcată."}</div>;
  }

  const antiRaid = draft.antiRaid;
  const channels = (metadata?.channels ?? []).filter((channel) => isTextChannel(channel.type));
  const hasChanges = data && JSON.stringify(data) !== JSON.stringify(draft);
  const setAntiRaid = (path: string[], value: unknown) => {
    setDraft((current: any) => {
      const next = JSON.parse(JSON.stringify(current));
      let target = next.antiRaid;
      path.slice(0, -1).forEach((part) => { target = target[part]; });
      target[path[path.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await update(draft);
      if (saved?.config) setDraft(JSON.parse(JSON.stringify(saved.config)));
      toast(configSaveToastOptions(
        saved?.notification?.status,
        "Anti-Raid salvat",
        "Regulile anti-raid au fost actualizate pentru acest server.",
      ));
    } catch (saveError: any) {
      if (saveError?.message?.includes("Conflict")) {
        // Never let canonical data overwrite a dirty draft silently. Clear the
        // stale draft first, then let the next response initialize this guild.
        setInitializedGuild(null);
        setDraft(null);
        await refetch();
      }
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message || "Reîncarcă pagina și încearcă din nou." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-4xl space-y-6 ${hasChanges ? "pb-28" : ""}`}>
      <header>
        <h1 className="mb-2 flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <ShieldAlert className="h-8 w-8 text-destructive" /> Anti-Raid
        </h1>
        <p className="text-muted-foreground">Detectează valurile rapide de intrări și protejează serverul înainte ca raidul să se extindă.</p>
      </header>

      {!metadata?.botCapabilities?.guildMembers && (
        <div className="flex gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>Intentul Discord <strong>Guild Members</strong> nu este activ. Regulile anti-raid pot să nu detecteze corect intrările până când intenția este activată în Discord Developer Portal.</p>
        </div>
      )}

      <section className="space-y-6 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-medium">Sistem Anti-Raid</h2>
            <p className="text-sm text-muted-foreground">Setările sunt independente de anti-spam și anti-flood.</p>
          </div>
          <Switch checked={Boolean(antiRaid.enabled)} onCheckedChange={(value) => setAntiRaid(["enabled"], value)} aria-label="Activează Anti-Raid" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Intrări pe minut</span>
            <Input type="number" min={1} max={10000} value={antiRaid.joinsPerMinute ?? 10} onChange={(event) => setAntiRaid(["joinsPerMinute"], Number(event.target.value))} />
            <span className="block text-xs text-muted-foreground">Între 1 și 10.000 intrări în fereastra de detecție.</span>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">Vârsta minimă a contului</span>
            <Input type="number" min={0} max={3650} value={antiRaid.accountAgeDays ?? 7} onChange={(event) => setAntiRaid(["accountAgeDays"], Number(event.target.value))} />
            <span className="block text-xs text-muted-foreground">Conturile mai noi pot declanșa regula.</span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Auto-Lockdown</p>
            <p className="text-xs text-muted-foreground">Oprește complet intrările noi când este detectat un raid.</p>
          </div>
          <Switch checked={Boolean(antiRaid.lockdown)} onCheckedChange={(value) => setAntiRaid(["lockdown"], value)} aria-label="Activează auto-lockdown" />
        </div>

        <label className="block space-y-2 text-sm">
          <span className="font-medium">Canal alerte raid</span>
          <Select value={antiRaid.alertChannelId || "__none__"} onValueChange={(value) => setAntiRaid(["alertChannelId"], value === "__none__" ? null : value)}>
            <SelectTrigger><SelectValue placeholder="Alege canalul de alerte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Neconfigurat</SelectItem>
              {channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="block text-xs text-muted-foreground">Canalul în care botul publică alertele Anti-Raid.</span>
        </label>

        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
          <div>
            <h3 className="font-medium">Regula de raid</h3>
            <p className="text-xs text-muted-foreground">Regula poate fi activată separat și aplică acțiunea aleasă la depășirea pragului.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium">Regulă activă</span>
              <Switch checked={Boolean(antiRaid.rule?.enabled)} onCheckedChange={(value) => setAntiRaid(["rule", "enabled"], value)} aria-label="Activează regula de raid" />
            </div>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Acțiune</span>
              <Select value={antiRaid.rule?.action || "warn"} onValueChange={(value) => setAntiRaid(["rule", "action"], value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nicio acțiune</SelectItem>
                  <SelectItem value="warn">Avertisment</SelectItem>
                  <SelectItem value="kick">Elimină (kick)</SelectItem>
                  <SelectItem value="ban">Blochează (ban)</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Severitate</span>
              <Select value={antiRaid.rule?.severity || "normal"} onValueChange={(value) => setAntiRaid(["rule", "severity"], value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">Blândă</SelectItem>
                  <SelectItem value="normal">Normală</SelectItem>
                  <SelectItem value="hard">Strictă</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Intrări observate</span>
              <Input type="number" min={1} max={10000} value={antiRaid.rule?.thresholds?.joins ?? 10} onChange={(event) => setAntiRaid(["rule", "thresholds", "joins"], Number(event.target.value))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Fereastră (secunde)</span>
              <Input type="number" min={1} max={3600} value={antiRaid.rule?.thresholds?.windowSeconds ?? 60} onChange={(event) => setAntiRaid(["rule", "thresholds", "windowSeconds"], Number(event.target.value))} />
            </label>
          </div>
        </div>
      </section>

      {hasChanges && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-between gap-3">
          <div className="bot-control-save-state">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? "Se salvează setările…" : "Ai modificări nesalvate."}</span>
          </div>
          <Button type="button" disabled={saving} onClick={() => void save()} className="gap-2 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Se salvează..." : "Salvează Setările"}
          </Button>
        </div>
      )}
    </div>
  );
}