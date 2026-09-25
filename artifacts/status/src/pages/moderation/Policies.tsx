import React, { useState, useEffect } from "react";
import { ShieldAlert, Users, Hash, Loader2, Save, ArrowUpRight } from "lucide-react";
import { useModerationConfig, useActiveGuild } from "../../hooks/use-moderation-api";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../../components/ui/toast";
import { configSaveToastOptions } from "../../lib/protection-toggle-feedback";

export function PoliciesPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState<any>(null);

  const initializedForId = React.useRef<string | null>(null);
  useEffect(() => {
    if (data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      setLocalData(JSON.parse(JSON.stringify(data)));
    }
  }, [data, guildId]);

  const handleSave = async () => {
    if (!localData || !guildId) return;
    setSaving(true);
    try {
      const saved = await update(localData);
      toast(configSaveToastOptions(
        saved?.notification?.status,
        "Configurație salvată",
        "Politicile și escaladarea au fost actualizate.",
      ));
    } catch (err: any) {
      if (err.message.includes("Conflict")) {
        toast({
          variant: "destructive",
          title: "Conflict de versiune",
          description: "Setările au fost modificate în altă parte.",
          action: <ToastAction altText="Reîncarcă" onClick={() => { if (initializedForId) initializedForId.current = null; window.location.reload(); }}>Reîncarcă</ToastAction>
        });
      } else {
        toast({ variant: "destructive", title: "Eroare", description: err.message });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArrayChange = (path: string[], value: string) => {
    const newLocal = { ...localData };
    let current = newLocal;
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value.split(",").map(s => s.trim()).filter(Boolean);
    setLocalData(newLocal);
  };

  if (loading) return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error || !localData) return <div role="alert" className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6"><p>{error?.message || "Nu s-a putut încărca configurația."}</p><Button variant="outline" onClick={() => void refetch()}>Reîncearcă</Button></div>;

  const hasUnsavedChanges = data && localData && JSON.stringify(data) !== JSON.stringify(localData);

  return (
    <div className={`max-w-5xl space-y-8 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-primary" /> Escaladare & Politici
        </h1>
        <p className="text-muted-foreground">Configurații pentru roluri, canale protejate și escaladarea automată a sancțiunilor.</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* Escalation */}
        <div className="bg-card border border-border p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <ArrowUpRight className="w-5 h-5 text-primary" />
            <h3 className="font-medium">Escaladare Automată</h3>
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-medium text-sm">Activează Sistemul de Escaladare</div>
              <div className="text-xs text-muted-foreground">Sancționează progresiv abaterile repetate ale aceluiași utilizator.</div>
            </div>
            <Switch 
              checked={localData.escalation.enabled} 
              onCheckedChange={(c) => setLocalData({ ...localData, escalation: { ...localData.escalation, enabled: c }})} 
            />
          </div>

          {localData.escalation.enabled && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                {localData.escalation.levels.map((level: any, index: number) => (
                  <div key={index} className="bg-background border border-border p-4 rounded-lg">
                    <div className="text-xs font-mono text-muted-foreground mb-2">NIVEL {level.level}</div>
                    <div className="mb-3">
                      <label className="text-xs">Număr abateri</label>
                      <Input 
                        type="number" 
                        value={level.violations} 
                        onChange={(e) => {
                          const newLevels = [...localData.escalation.levels];
                          newLevels[index].violations = parseInt(e.target.value) || 1;
                          setLocalData({ ...localData, escalation: { ...localData.escalation, levels: newLevels } });
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs">Acțiune</label>
                      <Select 
                        value={level.action} 
                        onValueChange={(val) => {
                          const newLevels = [...localData.escalation.levels];
                          newLevels[index].action = val;
                          setLocalData({ ...localData, escalation: { ...localData.escalation, levels: newLevels } });
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm mt-1 bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="warn">Warn</SelectItem>
                          <SelectItem value="mute">Mute</SelectItem>
                          <SelectItem value="kick">Kick</SelectItem>
                          <SelectItem value="ban">Ban</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-sm font-medium">Resetare Abateri (Zile)</label>
                <div className="text-xs text-muted-foreground mb-1">Cât timp trebuie să fie un utilizator "curat" pentru a-i fi iertat istoricul.</div>
                <Input 
                  type="number" 
                  value={localData.escalation.resetAfterDays}
                  onChange={(e) => setLocalData({ ...localData, escalation: { ...localData.escalation, resetAfterDays: parseInt(e.target.value) || 30 } })}
                  className="w-32"
                />
              </div>
            </div>
          )}
        </div>

        {/* Roles Policy */}
        <div className="bg-card border border-border p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-medium">Politici pe Roluri</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label className="text-sm font-medium">Roluri Protejate (Imune)</label>
              <div className="text-xs text-muted-foreground mb-2">ID-uri separate prin virgulă. Aceste roluri nu pot fi sancționate de bot sau moderatori.</div>
              <Input 
                placeholder="ex: 123456789, 987654321" 
                value={(localData.roles.protectedRoleIds || []).join(", ")}
                onChange={(e) => handleArrayChange(["roles", "protectedRoleIds"], e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Roluri Ignorate de AutoMod</label>
              <div className="text-xs text-muted-foreground mb-2">ID-uri care nu sunt afectate de filtrele automate (dar pot fi sancționate manual).</div>
              <Input 
                placeholder="ex: 123456789, 987654321" 
                value={(localData.roles.ignoredAutoModRoleIds || []).join(", ")}
                onChange={(e) => handleArrayChange(["roles", "ignoredAutoModRoleIds"], e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Channels Policy */}
        <div className="bg-card border border-border p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Hash className="w-5 h-5 text-violet-500" />
            <h3 className="font-medium">Politici pe Canale</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label className="text-sm font-medium">Canale Ignorate</label>
              <div className="text-xs text-muted-foreground mb-2">ID-uri de canale unde AutoMod este complet dezactivat (ex: #spam).</div>
              <Input 
                placeholder="ex: 123456789, 987654321" 
                value={(localData.channels.ignoredChannelIds || []).join(", ")}
                onChange={(e) => handleArrayChange(["channels", "ignoredChannelIds"], e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Canale Stricte</label>
              <div className="text-xs text-muted-foreground mb-2">ID-uri de canale unde nivelul de severitate e maxim permanent (ex: #anunturi).</div>
              <Input 
                placeholder="ex: 123456789, 987654321" 
                value={(localData.channels.strictChannelIds || []).join(", ")}
                onChange={(e) => handleArrayChange(["channels", "strictChannelIds"], e.target.value)}
              />
            </div>
          </div>
        </div>

      </div>
      
      {hasUnsavedChanges && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-between gap-3">
          <div className="bot-control-save-state">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? "Se salvează setările…" : "Ai modificări nesalvate."}</span>
          </div>
          <div className="mod-save-actions ml-auto">
            <Button onClick={handleSave} disabled={saving} className="gap-2 px-8">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Se salvează..." : "Salvează Politicile"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
