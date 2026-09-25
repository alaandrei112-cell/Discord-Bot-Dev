import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, ChevronRight, Loader2, Save } from "lucide-react";
import { Link } from "wouter";
import { useActiveGuild, useModerationConfig, useModerationMetadata } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { useToast } from "../../hooks/use-toast";
import { ConfigEditor, type ConfigSection } from "./ConfigEditor";
import { rebaseDraftChanges } from "../../lib/utils";

const DETAILS: Record<ConfigSection, { title: string; description: string }> = {
  automod: { title: "AutoMod", description: "Filtre de cuvinte, linkuri, anti-scam, emoji, majuscule și repetări." },
  "anti-raid": { title: "Anti-Raid", description: "Detectează valurile de intrări și conturile prea noi." },
  "anti-spam": { title: "Anti-Spam", description: "Limite pentru mesaje, editări, ștergeri, mențiuni și emoji." },
  "anti-flood": { title: "Anti-Flood", description: "Controlează mesajele foarte lungi și șirurile excesive." },
  suspicious: { title: "Comportament suspect", description: "Alerte pentru activitate și schimbări neobișnuite." },
  ai: { title: "Moderare AI", description: "Analiză inteligentă, categorii, sensibilitate și jurnalizare." },
  tools: { title: "Unelte staff", description: "Comenzi manuale și rolurile care le pot folosi." },
  "cases-audit": { title: "Cazuri și audit", description: "Păstrarea cazurilor, drepturile staff și jurnalul de audit." },
  "roles-channels": { title: "Roluri și canale", description: "Excluderi, protecții și politici speciale." },
  time: { title: "Profile de timp", description: "Reguli programate pentru noapte, zi, weekend și evenimente." },
  escalation: { title: "Escaladare", description: "Sancțiuni progresive după încălcări repetate." },
  embeds: { title: "Embed-uri și aspect", description: "Mesajele de moderare, media și animațiile." },
  permissions: { title: "Permisiuni", description: "Acces staff și izolare multi-server." },
};

const SECTION_KEYS: Record<ConfigSection, string[]> = {
  automod: ["autoMod"],
  "anti-raid": ["antiRaid"],
  "anti-spam": ["antiSpam"],
  "anti-flood": ["antiFlood"],
  suspicious: ["suspiciousBehavior"],
  ai: ["ai"],
  tools: ["manualTools"],
  "cases-audit": ["cases", "audit", "activityLog"],
  "roles-channels": ["roles", "channels"],
  time: ["timeProfiles"],
  escalation: ["escalation"],
  embeds: ["embeds"],
  permissions: ["permissions", "multiServer"],
};

export function CategorySettingsPage({ section }: { section: ConfigSection }) {
  const { guildId } = useActiveGuild();
  const { data, updateSection, loading, error, refetch } = useModerationConfig(guildId);
  const { data: metadata, error: metadataError } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const initializedEditor = useRef<string | null>(null);
  const draftRevision = useRef(0);
  const editorKey = guildId ? `${guildId}:${section}` : null;
  const editDraft = (next: any) => {
    draftRevision.current += 1;
    setDraft(next);
  };

  useEffect(() => {
    if (!editorKey) {
      initializedEditor.current = null;
      setDraft(null);
    } else if (initializedEditor.current && initializedEditor.current !== editorKey && !data) {
      initializedEditor.current = null;
      setDraft(null);
    } else if (data && initializedEditor.current !== editorKey) {
      initializedEditor.current = editorKey;
      draftRevision.current += 1;
      setDraft(structuredClone(data));
    }
  }, [data, editorKey]);

  const currentDraft = initializedEditor.current === editorKey && data ? draft : null;
  if ((loading || (data && initializedEditor.current !== editorKey)) && !currentDraft) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!currentDraft) return <div role="alert" className="rounded-xl border border-destructive/40 p-6 text-destructive">{error?.message || "Configurația nu a putut fi încărcată."}</div>;

  const detail = DETAILS[section];
  const changed = Boolean(data && JSON.stringify(data) !== JSON.stringify(currentDraft));
  const save = async () => {
    if (saving || !editorKey) return;
    const savingKey = editorKey;
    const savingRevision = draftRevision.current;
    setSaving(true);
    try {
      const result = await updateSection(SECTION_KEYS[section], currentDraft);
      if (initializedEditor.current !== savingKey) return;
      if (result?.config) {
        setDraft((current: any) => {
          if (draftRevision.current === savingRevision) return structuredClone(result.config);
          // Preserve controls changed while the request was in flight, but use
          // the server's provisioned channel IDs and other canonical fields.
          const next = structuredClone(result.config);
          for (const key of SECTION_KEYS[section]) next[key] = rebaseDraftChanges(next[key], currentDraft[key], current?.[key]);
          return next;
        });
      }
      toast({ title: `${detail.title} salvat`, description: "Setările trimise au fost actualizate. Verifică eventualele modificări rămase nesalvate." });
    } catch (saveError: any) {
      if (initializedEditor.current !== savingKey) return;
      if (section === "cases-audit" && currentDraft.activityLog?.enabled && !data?.activityLog?.enabled) {
        setDraft((current: any) => current && draftRevision.current === savingRevision ? {
          ...current,
          activityLog: structuredClone(data?.activityLog ?? current.activityLog),
        } : current);
      }
      toast({ variant: "destructive", title: "Salvarea a eșuat", description: saveError?.message || "Draftul a fost păstrat." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`max-w-5xl space-y-6 animate-stagger-1 ${changed ? "pb-28" : ""}`}>
      <header className="animate-stagger-2">
        <p className="mb-3 text-sm"><Link href="/config" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-medium tracking-wide"><ChevronRight className="h-4 w-4 rotate-180" /> Configurare</Link></p>
        <h1 className="flex items-center gap-3 text-3xl font-bold mod-heading"><Bot className="h-8 w-8 text-primary" />{detail.title}</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">{detail.description}</p>
      </header>
      {section === "automod" && (
        <div className="animate-stagger-3 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm shadow-inner shadow-primary/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-primary" />
          <p><strong>Discord AutoMod nativ:</strong> sincronizarea regulilor compatibile pornește asincron după salvare; confirmarea salvării nu garantează aplicarea pe Discord. Nu există un comutator nativ separat.</p>
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive shadow-inner shadow-destructive/10">{error.message}</div>}
      {metadataError && section === "cases-audit" && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive">
          Nu am putut verifica rolurile și permisiunile botului: {metadataError.message}
        </div>
      )}

      <div className="animate-stagger-4">
        <ConfigEditor value={currentDraft} onChange={editDraft} sections={[section]}
          guildId={guildId ?? undefined} discordRoles={metadata?.roles} botCapabilities={metadata?.botCapabilities} />
      </div>

      {changed && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground font-medium text-sm">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? "Se salvează…" : "Ai modificări nesalvate."}</span>
          </div>
          <div className="mod-save-actions ml-auto">
            <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8 font-semibold tracking-wide shadow-lg shadow-primary/20">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvează
            </Button>
          </div>
        </div>
      )}
      <Button variant="ghost" onClick={() => void refetch()} className="sr-only">Reîncarcă</Button>
    </div>
  );
}