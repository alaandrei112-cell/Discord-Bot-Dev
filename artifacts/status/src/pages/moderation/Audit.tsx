import { useEffect, useState } from "react";
import { History, Search, ShieldCheck, Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "../../components/ui/input";
import { useAuditLogs, useActiveGuild, useActionLedger, useReconcileAction } from "../../hooks/use-moderation-api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  AUDIT_EVENT_CATEGORIES,
  AUDIT_PAGE_SIZE,
  auditDateRangeError,
  type AuditEventCategoryFilter,
  presentAuditActor,
  presentAuditLog,
} from "../../lib/moderation-audit";

function ReconcileDialog({ actionId, open, onOpenChange, onReconciled }: { actionId: string | null, open: boolean, onOpenChange: (o: boolean) => void, onReconciled: () => void }) {
  const { guildId } = useActiveGuild();
  const reconcile = useReconcileAction(guildId);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReconcile = async (status: "applied" | "failed") => {
    if (!actionId) return;
    if (!note.trim()) {
      toast({ variant: "destructive", title: "Eroare", description: "Notița este obligatorie pentru reconciliere." });
      return;
    }
    
    setLoading(true);
    try {
      await reconcile(actionId, status, note);
      toast({ title: "Acțiune reconciliată", description: "Registrul a fost actualizat cu succes." });
      onReconciled();
      onOpenChange(false);
      setNote("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare la reconciliere", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle>Reconciliere Acțiune Discord</DialogTitle>
          <DialogDescription>
            Această acțiune este marcată ca "pending" (în așteptare) sau "uncertain" (incertă). 
            Verifică manual în Discord dacă a fost aplicată cu succes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-primary/10 text-primary border border-primary/20 p-3 rounded-md text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p><strong>Nu reîncerca acțiunea</strong> înainte să fii sigur că a eșuat. Discord ar putea să o aplice cu întârziere (ex: rate limits).</p>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Motivul reconcilierii / Notiță staff</label>
            <Textarea 
              placeholder="Ex: Confirmat pe server că utilizatorul a primit mute..." 
              value={note}
              onChange={e => setNote(e.target.value)}
              className="resize-none h-24"
            />
          </div>
        </div>
        
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => handleReconcile("failed")} disabled={loading} className="text-destructive hover:bg-destructive/10">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Marchează Eșuată
          </Button>
          <Button onClick={() => handleReconcile("applied")} disabled={loading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirmă Aplicarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AuditPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AuditEventCategoryFilter>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(0);
  const { guildId } = useActiveGuild();
  const offset = page * AUDIT_PAGE_SIZE;
  const { data: auditEvents, total, loading } = useAuditLogs(guildId, {
    search, category, start, end, limit: AUDIT_PAGE_SIZE, offset,
  });
  useEffect(() => { setPage(0); }, [guildId]);
  
  // Pending actions ledger
  const { data: pendingActions, refetch: refetchPending } = useActionLedger(guildId, { status: "pending" });
  const { data: uncertainActions, refetch: refetchUncertain } = useActionLedger(guildId, { status: "uncertain" });
  const activeLedger = [...(pendingActions || []), ...(uncertainActions || [])];
  
  const [reconcileId, setReconcileId] = useState<string | null>(null);

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  const rangeError = auditDateRangeError({ start, end });
  const selectedCategoryLabel = AUDIT_EVENT_CATEGORIES.find((option) => option.value === category)?.label;
  const emptyMessage = rangeError || (start || end
    ? "Niciun eveniment în intervalul selectat nu corespunde filtrelor."
    : category !== "all" && search.trim()
    ? `Niciun eveniment din categoria „${selectedCategoryLabel}” nu corespunde căutării.`
    : category !== "all"
      ? `Niciun eveniment în categoria „${selectedCategoryLabel}”.`
      : search.trim()
        ? "Niciun eveniment nu corespunde căutării."
        : "Niciun eveniment găsit.");

  return (
    <div className="space-y-6 animate-stagger-1">
      {activeLedger.length > 0 && (
        <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-xl space-y-4 animate-stagger-2 shadow-inner shadow-destructive/10">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div>
              <h2 className="font-bold text-lg mod-heading text-destructive">Atenție: Acțiuni neconfirmate în așteptare</h2>
              <p className="text-sm opacity-90">Unele acțiuni manuale sau automate necesită reconciliere (verificare manuală în Discord).</p>
            </div>
          </div>
          
          <div className="space-y-2 mt-2">
            {activeLedger.map((action: any) => (
              <div key={action.id} className="bg-background/80 border border-destructive/30 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-destructive text-white shadow-[0_0_8px_rgba(214,84,81,0.6)]">{action.status}</span>
                    <span className="font-bold uppercase text-foreground">{action.actionType}</span>
                    <span className="text-xs font-mono text-muted-foreground">{action.id.substring(0,8)}</span>
                  </div>
                  <div className="text-sm text-foreground mt-1">
                    Intent: <code className="font-mono text-xs">{JSON.stringify(action.input)}</code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Actor: {action.actorId} • Creat: {new Date(action.createdAt).toLocaleString()}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/20 border-destructive/50" onClick={() => setReconcileId(action.id)}>
                  Reconciliază
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <ReconcileDialog 
        actionId={reconcileId} 
        open={reconcileId !== null} 
        onOpenChange={(open) => !open && setReconcileId(null)}
        onReconciled={() => { refetchPending(); refetchUncertain(); }}
      />

      <div className="animate-stagger-3">
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3 mod-heading">
          <History className="w-8 h-8 text-primary" /> Jurnal de Audit & Loguri
        </h1>
        <p className="text-muted-foreground">Monitorizare strictă pentru acțiunile staff-ului și evenimente AutoMod.</p>
      </div>

      <div className="mod-card flex flex-col animate-stagger-4">
        <div className="p-4 border-b border-border/80 flex items-center gap-4 bg-background/40">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">Logurile sunt imuabile (nu pot fi șterse sau modificate).</p>
        </div>
        <div className="p-4 border-b border-border/80 bg-background/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Caută în audit (acțiune, actor)..."
                value={search}
                maxLength={200}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9 bg-background/50 border-border/50"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <label id="audit-category-label" className="text-xs font-medium text-muted-foreground">Categorie</label>
                <Select value={category} onValueChange={(value) => { setCategory(value as AuditEventCategoryFilter); setPage(0); }}>
                  <SelectTrigger aria-labelledby="audit-category-label" className="w-full sm:w-56 bg-background/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate categoriile</SelectItem>
                    {AUDIT_EVENT_CATEGORIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {category !== "all" && (
              <Button type="button" variant="outline" size="sm" onClick={() => { setCategory("all"); setPage(0); }}>
                  <X className="mr-1.5 h-4 w-4" />
                  Elimină filtrul
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="audit-start" className="text-xs font-medium text-muted-foreground">De la</label>
              <Input id="audit-start" type="datetime-local" step="1" value={start}
                onChange={e => { setStart(e.target.value); setPage(0); }} aria-invalid={!!rangeError}
                aria-describedby="audit-range-help" className="bg-background/50 border-border/50" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="audit-end" className="text-xs font-medium text-muted-foreground">Până la</label>
              <Input id="audit-end" type="datetime-local" step="1" value={end}
                onChange={e => { setEnd(e.target.value); setPage(0); }} aria-invalid={!!rangeError}
                aria-describedby="audit-range-help" className="bg-background/50 border-border/50" />
            </div>
            {(start || end) && (
              <Button type="button" variant="outline" size="sm" onClick={() => { setStart(""); setEnd(""); setPage(0); }}>
                <X className="mr-1.5 h-4 w-4" /> Elimină intervalul
              </Button>
            )}
          </div>
          <p id="audit-range-help" className="mt-2 text-xs text-muted-foreground">
            Orele sunt locale; limitele sunt incluse. Filtrele caută în toate evenimentele disponibile.
          </p>
          {rangeError && <p role="alert" className="mt-2 text-sm text-destructive">{rangeError}</p>}
        </div>

        <div className="min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-48 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : auditEvents.length > 0 ? (
            <div className="divide-y divide-border/50">
              {auditEvents.map((ev) => {
                const presentation = presentAuditLog(ev);
                return (
                <div key={ev.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/40 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground bg-background border border-border/50 px-1.5 py-0.5 rounded">{ev.id ? ev.id.substring(0,8) : 'SISTEM'}</span>
                      <span className="text-sm font-semibold tracking-wide text-foreground">{presentation.title}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Actor: <span className="text-foreground">{presentAuditActor(ev)}</span>
                      {ev.targetId && <span> → Țintă: <span className="text-foreground">{ev.targetId}</span></span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {presentation.details}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-background border border-border px-2 py-1 rounded whitespace-nowrap shadow-inner">
                    {new Date(ev.createdAt).toLocaleString()}
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <History className="w-8 h-8 mb-2 opacity-20" />
              <p>{emptyMessage}</p>
            </div>
          )}
        </div>
        {!loading && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {offset + 1}–{Math.min(offset + auditEvents.length, total)} din {total} evenimente
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Anterioare
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={offset + AUDIT_PAGE_SIZE >= total}
                onClick={() => setPage((current) => current + 1)}>
                Următoarele <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
