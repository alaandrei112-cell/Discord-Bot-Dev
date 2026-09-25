import { useState } from "react";
import { Zap, AlertTriangle, Send, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useManualAction, useActiveGuild, useModerationMetadata } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { Textarea } from "../../components/ui/textarea";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().trim().max(max).optional(),
);
const optionalNumber = z.preprocess(
  (value) => value === "" || value === undefined || value === null ? undefined : Number(value),
  z.number().finite().optional(),
);

const actionSchema = z.object({
  type: z.enum(["warn", "mute", "kick", "ban", "unmute", "purge", "slowmode", "lock", "unlock", "nick", "role"]),
  targetId: optionalText(25),
  reason: optionalText(500),
  durationMinutes: optionalNumber.pipe(z.number().int().min(1).max(40320).optional()),
  channelId: optionalText(25),
  roleId: optionalText(25),
  nickname: optionalText(32),
  amount: optionalNumber.pipe(z.number().int().min(0).max(21600).optional()),
}).superRefine((value, ctx) => {
  if (["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(value.type) && !value.targetId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul țintei este necesar", path: ["targetId"] });
  }
  if (value.type === "mute" && !value.durationMinutes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Durata este necesară", path: ["durationMinutes"] });
  }
  if (["purge", "lock", "unlock", "slowmode"].includes(value.type) && !value.channelId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul canalului este necesar", path: ["channelId"] });
  }
  if (value.type === "role" && !value.roleId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID-ul rolului este necesar", path: ["roleId"] });
  }
  if (value.type === "nick" && !value.nickname) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numele nou este necesar", path: ["nickname"] });
  }
  if (value.type === "purge" && (value.amount === undefined || value.amount < 1 || value.amount > 100)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numărul de mesaje este necesar", path: ["amount"] });
  }
  if (value.type === "slowmode" && value.amount === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Numărul de secunde este necesar (0 oprește slowmode)", path: ["amount"] });
  }
});

type ActionValues = z.infer<typeof actionSchema>;

function MetadataSelectField({
  label,
  fallbackLabel,
  field,
  options,
}: {
  label: string;
  fallbackLabel: string;
  field: { value?: string; onChange: (value: string) => void };
  options: Array<{ id: string; name: string; managed?: boolean }>;
}) {
  const selected = options.some((option) => option.id === field.value) ? field.value : undefined;
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <Select value={selected} onValueChange={field.onChange}>
        <FormControl>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder={`Alege ${label.toLowerCase()}`} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} disabled={option.managed}>
              {option.name} ({option.id})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={`${label} - ${fallbackLabel}`}
        placeholder={`${fallbackLabel} (ID Discord)`}
        value={field.value || ""}
        onChange={(event) => field.onChange(event.target.value.trim())}
      />
      <p className="text-xs text-muted-foreground">Poți introduce manual ID-ul dacă nu este disponibil în metadate.</p>
    </div>
  );
}

export function CommandsPage() {
  const { guildId } = useActiveGuild();
  const { execute: executeAction } = useManualAction(guildId);
  const { data: metadata, error: metadataError } = useModerationMetadata(guildId);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [lastAttempt, setLastAttempt] = useState<ActionValues | null>(null);

  const form = useForm<z.infer<typeof actionSchema>>({
    resolver: zodResolver(actionSchema),
    defaultValues: { type: "warn", reason: "" },
  });

  const actionType = form.watch("type");

  async function submitAction(values: ActionValues, isRetry = false) {
    if (!confirm(`Ești sigur că vrei să execuți acțiunea ${values.type.toUpperCase()}? Această operațiune va afecta direct serverul de Discord.`)) {
      return;
    }
    
    setLastAttempt(values);
    setLastResult(null);
    setLoading(true);
    setActionError(null);
    try {
      const res = await executeAction(values);
      setLastResult(res);
      toast({ title: "Acțiune executată", description: "Comanda a fost trimisă cu succes către Oracol." });
    } catch (err: any) {
      const message = err?.message || "Acțiunea nu a putut fi executată.";
      setLastResult(null);
      setActionError(message);
      toast({ variant: "destructive", title: "Acțiune eșuată", description: message });
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(values: ActionValues) {
    void submitAction(values);
  }

  if (!guildId) return <div className="p-8 text-center text-muted-foreground">Selectează un server.</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" /> Acțiuni Manuale
        </h1>
        <p className="text-muted-foreground">Execută comenzi de moderare direct din consolă, ocolind Discord-ul.</p>
      </div>

      <div className="bg-primary/10 border border-primary/30 text-primary p-4 rounded-xl flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong className="text-foreground">Atenție!</strong> Orice acțiune executată aici va fi aplicată instantaneu pe serverul Discord selectat.
          Toate comenzile sunt înregistrate în sistemul de audit.
        </div>
      </div>
      {metadataError && (
          <div role="alert" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm text-primary">
          Metadatele Discord nu au putut fi încărcate ({metadataError.message}). Poți continua cu ID-uri introduse manual.
        </div>
      )}
      {actionError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <p>{actionError}</p>
          {lastAttempt && (
            <Button type="button" variant="outline" className="mt-3" disabled={loading} onClick={() => void submitAction(lastAttempt, true)}>
              Reîncearcă aceeași acțiune
            </Button>
          )}
        </div>
      )}
      {lastResult !== null && (
        <div role="status" data-testid="manual-action-result" className="rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
          <strong>Rezultatul acțiunii</strong>
          <pre className="mt-2 max-w-full overflow-auto whitespace-pre-wrap font-mono text-xs">{JSON.stringify(lastResult, null, 2)}</pre>
        </div>
      )}

      <div className="bg-card border border-border p-6 rounded-xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipul Acțiunii</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background"><SelectValue placeholder="Alege comanda" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="warn">Avertisment (Warn)</SelectItem>
                        <SelectItem value="mute">Mute</SelectItem>
                        <SelectItem value="unmute">Unmute</SelectItem>
                        <SelectItem value="kick">Kick</SelectItem>
                        <SelectItem value="ban">Ban</SelectItem>
                        <SelectItem value="purge">Șterge Mesaje (Purge)</SelectItem>
                        <SelectItem value="lock">Închide Canal (Lock)</SelectItem>
                        <SelectItem value="unlock">Deschide Canal (Unlock)</SelectItem>
                        <SelectItem value="nick">Schimbă Nickname</SelectItem>
                        <SelectItem value="role">Acordă Rol</SelectItem>
                        <SelectItem value="slowmode">Setează Slowmode</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {["warn", "mute", "kick", "ban", "unmute", "nick", "role"].includes(actionType) && (
                <FormField
                  control={form.control}
                  name="targetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Utilizator (Țintă)</FormLabel>
                      <FormControl>
                        <Input placeholder="Discord User ID (ex: 123456789...)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {["purge", "lock", "unlock", "slowmode"].includes(actionType) && (
                <FormField
                  control={form.control}
                  name="channelId"
                  render={({ field }) => (
                    <FormItem>
                      <MetadataSelectField
                        label="Canal"
                        fallbackLabel="ID canal"
                        field={field}
                        options={(metadata?.channels || []).map((channel) => ({ id: channel.id, name: `#${channel.name}` }))}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "mute" && (
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durată (Minute)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="60" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}


              {actionType === "nick" && (
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nou Nickname</FormLabel>
                      <FormControl>
                        <Input placeholder="Nume nou (max 32 char)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "role" && (
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <MetadataSelectField
                        label="Rol"
                        fallbackLabel="ID rol"
                        field={field}
                        options={(metadata?.roles || []).map((role) => ({ id: role.id, name: `@${role.name}`, managed: role.managed }))}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "slowmode" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                         <FormLabel>Slowmode (secunde, 0 = oprit)</FormLabel>
                      <FormControl>
                           <Input type="number" min={0} max={21600} placeholder="5" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {actionType === "purge" && (
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Număr de mesaje de șters</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={100} placeholder="Ex: 50 (Max: 100)" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivul Acțiunii (opțional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Motivul va fi înregistrat în loguri și trimis utilizatorului (după caz)..." 
                      className="resize-none h-24 bg-background"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-end gap-3">
              <div className="mod-save-actions ml-auto">
                <Button type="submit" disabled={loading} className="gap-2 px-8">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Execută Comanda
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
