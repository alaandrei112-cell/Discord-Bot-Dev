import { useState } from "react";
import { BookOpen, Search, Filter, ChevronRight, FileDown, Loader2, Save, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useCases, useActiveGuild, useCaseDetails } from "../../hooks/use-moderation-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import { useToast } from "../../hooks/use-toast";

function CaseDetailsDialog({ caseId, open, onOpenChange, onUpdated }: { caseId: string | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated?: () => void }) {
  const { guildId } = useActiveGuild();
  const { data: details, loading, updateCase, addNote } = useCaseDetails(guildId, caseId);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await addNote(newNote);
      setNewNote("");
      toast({ title: "Notiță adăugată", description: "Notița a fost salvată în dosar." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err.message });
    } finally {
      setSavingNote(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!details) return;
    setUpdating(true);
    try {
      await updateCase({ status: details.status === "open" ? "closed" : "open" });
      if (onUpdated) onUpdated();
      toast({ title: "Status actualizat", description: "Statusul cazului a fost modificat." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Eroare", description: err.message });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-background border-border text-foreground">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Detaliile Dosarului <span className="font-mono text-muted-foreground text-sm ml-2">{caseId?.substring(0, 8)}...</span>
          </DialogTitle>
          <DialogDescription>Informații complete despre sancțiune și dovezi asociate.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : details ? (
          <div className="flex-1 overflow-y-auto pr-4 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="mod-card p-4">
                <div className="text-xs text-muted-foreground mb-1">Utilizator vizat</div>
                <div className="font-medium text-lg">{details.subjectId}</div>
              </div>
              <div className="mod-card p-4">
                <div className="text-xs text-muted-foreground mb-1">Moderator / Sistem</div>
                <div className="font-medium text-lg">{details.actorId}</div>
              </div>
              <div className="mod-card p-4">
                <div className="text-xs text-muted-foreground mb-1">Acțiune aplicată</div>
                <div className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-bold uppercase mt-1 ${
                  details.actionType === 'ban' ? 'bg-destructive/10 text-destructive' :
                  details.actionType === 'mute' ? 'bg-amber-500/10 text-amber-500' :
                  'bg-primary/10 text-primary'
                }`}>
                  {details.actionType}
                </div>
              </div>
              <div className="mod-card p-4">
                <div className="text-xs text-muted-foreground mb-1">Status Curent</div>
                <div className="flex items-center justify-between mt-1">
                  <span className={`inline-flex items-center gap-1.5 font-medium ${details.status === 'open' ? 'text-primary' : 'text-muted-foreground'}`}>
                    <span className={`w-2 h-2 rounded-full ${details.status === 'open' ? 'bg-primary shadow-[0_0_8px_rgba(214,84,81,0.6)]' : 'bg-muted-foreground'}`} />
                    {details.status === 'open' ? 'Deschis' : 'Închis'}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleToggleStatus} disabled={updating}>
                    {updating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Schimbă
                  </Button>
                </div>
              </div>
            </div>

            <div className="mod-card p-4">
              <div className="text-sm font-medium mb-2">Motivul Sancțiunii</div>
              <p className="text-muted-foreground text-sm whitespace-pre-wrap bg-background/50 p-3 rounded-lg border border-border/50">
                {details.reason || "Nespecificat"}
              </p>
            </div>
            
            {details.evidence && details.evidence.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium border-b border-border pb-2">Dovezi Asociate</div>
                {details.evidence.map((ev: any, i: number) => (
                  <div key={i} className="bg-secondary/30 p-3 rounded-lg border border-border/50 text-sm">
                    {ev.kind && <span className="font-semibold text-xs text-primary mr-2 uppercase">[{ev.kind}]</span>}
                    {ev.description && <span className="mr-2">{ev.description}</span>}
                    {ev.url && <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all block mt-1">{ev.url}</a>}
                    {(ev.messageId || ev.channelId) && (
                      <div className="text-xs text-muted-foreground mt-2 font-mono">
                        {ev.messageId && <span>Msg: {ev.messageId} </span>}
                        {ev.channelId && <span>Ch: {ev.channelId}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4">
              <div className="text-sm font-medium border-b border-border pb-2">Notițe Staff</div>
              
              <div className="space-y-3">
                {details.notes?.length > 0 ? details.notes.map((note: any, i: number) => (
                  <div key={i} className="bg-secondary/30 p-3 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold">{note.authorId}</span>
                      <span className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-foreground">{note.content}</p>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground italic">Nicio notiță adăugată încă.</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs font-medium mb-2">Adaugă notiță nouă</div>
                <Textarea 
                  placeholder="Scrie o observație sau actualizare..." 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="bg-background resize-none h-20 mb-2"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAddNote} disabled={savingNote || !newNote.trim()}>
                    {savingNote ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Salvează Notița
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-8 text-center text-muted-foreground">Eroare la încărcarea detaliilor.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CasesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { guildId } = useActiveGuild();
  const { data: cases, loading, refetch } = useCases(guildId, { 
    status: statusFilter !== "all" ? statusFilter : undefined,
    userId: search || undefined,
    limit: 50 
  });

  const [selectedCase, setSelectedCase] = useState<string | null>(null);

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  return (
    <div className="space-y-6 animate-stagger-1">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 animate-stagger-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3 mod-heading">
            <BookOpen className="w-8 h-8 text-primary" /> Cazuri
          </h1>
          <p className="text-muted-foreground">Arhiva sancțiunilor și dosarelor utilizatorilor.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => window.open(`/api/moderation/guilds/${guildId}/cases/export`)}>
          <FileDown className="w-4 h-4" /> Exportă Arhiva
        </Button>
      </div>

      <div className="mod-card flex flex-col animate-stagger-3">
        <div className="p-4 border-b border-border/80 bg-background/40 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Caută după Discord User ID..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate</SelectItem>
                <SelectItem value="open">Deschise</SelectItem>
                <SelectItem value="closed">Închise</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="shrink-0">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-48 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : cases && cases.length > 0 ? (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-secondary/50 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">ID Caz</th>
                  <th className="px-6 py-4 font-medium">Utilizator</th>
                  <th className="px-6 py-4 font-medium">Acțiune</th>
                  <th className="px-6 py-4 font-medium">Motiv</th>
                  <th className="px-6 py-4 font-medium">Moderator</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Dată</th>
                  <th className="px-6 py-4 text-right">Detalii</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cases.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedCase(c.id)}>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{c.id.substring(0, 8)}</td>
                    <td className="px-6 py-4 font-medium">{c.subjectId}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase ${
                        c.actionType === 'ban' ? 'bg-destructive/10 text-destructive' :
                        c.actionType === 'mute' ? 'bg-primary/10 text-primary' :
                        'bg-primary/10 text-primary'
                      }`}>
                        {c.actionType || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground max-w-[200px] truncate" title={c.reason}>{c.reason || "Nespecificat"}</td>
                    <td className="px-6 py-4">{c.actorId}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 ${c.status === 'open' ? 'text-primary' : 'text-muted-foreground'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'open' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                        {c.status === 'open' ? 'Deschis' : 'Închis'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <BookOpen className="w-8 h-8 mb-2 opacity-20" />
              <p>Niciun caz găsit.</p>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-secondary/30">
          <span>Afișare {cases?.length || 0} cazuri</span>
        </div>
      </div>
      
      <CaseDetailsDialog 
        caseId={selectedCase} 
        open={selectedCase !== null} 
        onOpenChange={(o) => !o && setSelectedCase(null)} 
      />
    </div>
  );
}
