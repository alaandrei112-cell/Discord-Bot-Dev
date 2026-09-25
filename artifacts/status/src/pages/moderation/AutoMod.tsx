import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Bot, MessageSquareWarning, Link as LinkIcon, AlertCircle, Loader2 } from "lucide-react";
import { useModerationConfig, useActiveGuild } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../../components/ui/toast";
import { configSaveToastOptions } from "../../lib/protection-toggle-feedback";

const ruleSchema = z.object({
  enabled: z.boolean(),
  action: z.enum(["none", "warn", "mute", "kick", "ban", "delete"]),
  severity: z.enum(["soft", "normal", "hard"]),
});

const autoModFormSchema = z.object({
  enabled: z.boolean(),
  wordFilter: ruleSchema,
  linkBlock: ruleSchema,
  forbiddenWords: z.string(),
  aiEnabled: z.boolean(),
  aiAction: z.enum(["none", "warn", "mute", "kick", "ban", "delete"]),
  aiSensitivity: z.enum(["low", "medium", "high"]),
});

export function AutoModPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof autoModFormSchema>>({
    resolver: zodResolver(autoModFormSchema),
    defaultValues: {
      enabled: false,
      wordFilter: { enabled: false, action: "none", severity: "normal" },
      linkBlock: { enabled: false, action: "none", severity: "normal" },
      forbiddenWords: "",
      aiEnabled: false,
      aiAction: "none",
      aiSensitivity: "medium",
    },
  });

  const initializedForId = React.useRef<string | null>(null);
  useEffect(() => {
    if (data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      form.reset({
        enabled: data.autoMod?.enabled ?? false,
        wordFilter: { 
          enabled: data.autoMod?.wordFilter?.enabled ?? false, 
          action: data.autoMod?.wordFilter?.action ?? "none", 
          severity: data.autoMod?.wordFilter?.severity ?? "normal" 
        },
        linkBlock: { 
          enabled: data.autoMod?.linkBlock?.enabled ?? false, 
          action: data.autoMod?.linkBlock?.action ?? "none", 
          severity: data.autoMod?.linkBlock?.severity ?? "normal" 
        },
        forbiddenWords: (data.autoMod?.forbiddenWords || []).join(", "),
        aiEnabled: data.ai?.enabled ?? false,
        aiAction: data.ai?.action ?? "none",
        aiSensitivity: data.ai?.sensitivity ?? "medium",
      });
    }
  }, [data, form, guildId]);

  async function onSubmit(values: z.infer<typeof autoModFormSchema>) {
    if (!data) return;
    setSaving(true);
    try {
      const saved = await update({
        ...data,
        autoMod: {
          ...data.autoMod,
          enabled: values.enabled,
          wordFilter: { ...data.autoMod?.wordFilter, ...values.wordFilter },
          linkBlock: { ...data.autoMod?.linkBlock, ...values.linkBlock },
          forbiddenWords: values.forbiddenWords.split(",").map(s => s.trim()).filter(Boolean),
        },
        ai: {
          ...data.ai,
          enabled: values.aiEnabled,
          action: values.aiAction,
          sensitivity: values.aiSensitivity,
        }
      });
      toast(configSaveToastOptions(
        saved?.notification?.status,
        "Setări salvate",
        "Configurația AutoMod și AI a fost actualizată cu succes.",
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
  }

  if (loading) return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  if (error || !data) return <div role="alert" className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6"><p>{error?.message || "Nu s-a putut încărca configurația."}</p><Button variant="outline" onClick={() => void refetch()}>Reîncearcă</Button></div>;

  const hasUnsavedChanges = form.formState.isDirty;

  return (
    <div className={`automod-page max-w-4xl space-y-6 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Bot className="w-8 h-8 text-primary" /> AutoMod & AI
        </h1>
        <p className="text-muted-foreground">Reguli automate și moderare inteligentă (Oracolul Judecător).</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="bg-card border border-border p-6 rounded-xl">
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="text-lg">Activează AutoMod General</FormLabel>
                    <FormDescription>
                      Comutatorul principal pentru toate filtrele automate clasice.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Word Filter */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                 <MessageSquareWarning className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Filtru de Cuvinte</h3>
              </div>
              
              <div className="automod-field-grid grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="wordFilter.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Filtrează mesajele</FormLabel>
                        <FormDescription>Blochează cuvintele interzise.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wordFilter.action"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Acțiune</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Alege..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nicio acțiune</SelectItem>
                          <SelectItem value="delete">Șterge mesajul</SelectItem>
                          <SelectItem value="warn">Avertisment (Warn)</SelectItem>
                          <SelectItem value="mute">Mute automat</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="forbiddenWords"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuvinte interzise (separate prin virgulă)</FormLabel>
                    <FormControl>
                      <Input placeholder="cuvant1, cuvant2, fraza interzisa" {...field} />
                    </FormControl>
                    <FormDescription>Mesajele care conțin aceste cuvinte vor declanșa filtrul.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* AI Moderation */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4 relative z-10">
                <Bot className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Oracolul Judecător (AI Moderation)</h3>
              </div>
              
              <div className="automod-field-grid grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                <FormField
                  control={form.control}
                  name="aiEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4 bg-background">
                      <div className="space-y-0.5">
                        <FormLabel>Activează Analiza AI</FormLabel>
                        <FormDescription>Detectează toxicitate, atacuri și bullying.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="aiAction"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Acțiune Automată AI</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full min-w-0 bg-background"><SelectValue placeholder="Alege..." /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Nicio acțiune (Doar Audit)</SelectItem>
                            <SelectItem value="delete">Șterge mesajul</SelectItem>
                            <SelectItem value="warn">Avertisment</SelectItem>
                            <SelectItem value="mute">Mute</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="aiSensitivity"
                    render={({ field }) => (
                      <FormItem className="min-w-0">
                        <FormLabel>Sensibilitate</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full min-w-0 bg-background"><SelectValue placeholder="Alege..." /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Scăzută (Doar cazuri extreme)</SelectItem>
                            <SelectItem value="medium">Medie (Echilibrată)</SelectItem>
                            <SelectItem value="high">Ridicată (Strict)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Link Blocker */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                 <LinkIcon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Blocare Link-uri</h3>
              </div>
              
              <div className="automod-field-grid grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="linkBlock.enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Blochează linkuri suspecte</FormLabel>
                        <FormDescription>Împiedică spamul cu reclame.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="linkBlock.action"
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>Acțiune automată</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Alege..." /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Nicio acțiune</SelectItem>
                          <SelectItem value="delete">Șterge mesajul</SelectItem>
                          <SelectItem value="warn">Avertisment</SelectItem>
                          <SelectItem value="mute">Mute</SelectItem>
                          <SelectItem value="kick">Kick</SelectItem>
                          <SelectItem value="ban">Ban</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
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
                <Button type="submit" disabled={saving} className="gap-2 px-8">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? "Se salvează..." : "Salvează Setările"}
                </Button>
              </div>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
