import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, Shield, MessageSquare, AlertOctagon, Loader2 } from "lucide-react";
import { useModerationConfig, useActiveGuild } from "../../hooks/use-moderation-api";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useToast } from "../../hooks/use-toast";
import { configSaveToastOptions } from "../../lib/protection-toggle-feedback";

const protectionFormSchema = z.object({
  protectionEnabled: z.boolean(),
  antiSpamEnabled: z.boolean(),
  antiFloodEnabled: z.boolean(),
  suspiciousEnabled: z.boolean(),
});

export function ProtectionPage() {
  const { guildId } = useActiveGuild();
  const { data, update, loading, error, refetch } = useModerationConfig(guildId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof protectionFormSchema>>({
    resolver: zodResolver(protectionFormSchema),
    defaultValues: {
      protectionEnabled: true,
      antiSpamEnabled: false,
      antiFloodEnabled: false,
      suspiciousEnabled: false,
    },
  });

  const initializedForId = React.useRef<string | null>(null);
  const protectionEnabled = form.watch("protectionEnabled");
  useEffect(() => {
    if (data && initializedForId.current !== guildId) {
      initializedForId.current = guildId;
      form.reset({
         protectionEnabled: data.protection?.enabled ?? true,
        antiSpamEnabled: data.antiSpam?.enabled ?? false,
        antiFloodEnabled: data.antiFlood?.enabled ?? false,
        suspiciousEnabled: data.suspiciousBehavior?.enabled ?? false,
      });
    }
  }, [data, form, guildId]);

  async function onSubmit(values: z.infer<typeof protectionFormSchema>) {
    if (!data) return;
    setSaving(true);
    const buildConfig = (current: any) => ({
      ...current,
      protection: {
        ...current.protection,
        enabled: values.protectionEnabled,
      },
      antiSpam: { ...current.antiSpam, enabled: values.antiSpamEnabled },
      antiFlood: { ...current.antiFlood, enabled: values.antiFloodEnabled },
      suspiciousBehavior: { ...current.suspiciousBehavior, enabled: values.suspiciousEnabled },
    });
    try {
      const saved = await update(buildConfig(data));
      toast(configSaveToastOptions(
        saved?.notification?.status,
        "Setări salvate",
        "Configurația de protecție a fost actualizată.",
      ));
    } catch (err: any) {
      if (err.message.includes("Conflict")) {
        try {
          const freshData = await refetch();
          if (freshData) {
            const saved = await update(buildConfig(freshData));
            toast(configSaveToastOptions(
              saved?.notification?.status,
              "Setări salvate",
              "Configurația de protecție a fost actualizată.",
            ));
            return;
          }
        } catch (retryError: any) {
          err = retryError;
        }
        toast({ variant: "destructive", title: "Conflict de versiune", description: "Setările au fost modificate în altă parte. Reîncarcă pagina și încearcă din nou." });
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
    <div className={`max-w-4xl space-y-6 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" /> Protecție Server
        </h1>
        <p className="text-muted-foreground">Sisteme defensive împotriva raidurilor, spamului și flood-ului.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="bg-card border border-border p-6 rounded-xl">
            <FormField
              control={form.control}
              name="protectionEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-6">
                  <div className="space-y-1">
                    <FormLabel className="text-base">Protecție Server</FormLabel>
                    <FormDescription>
                      Oprește toate modulele defensive fără să șteargă regulile configurate.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Activează sau oprește toate modulele de protecție"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {/* Spam & Flood */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Control Trafic</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="antiSpamEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Anti-Spam</FormLabel>
                        <FormDescription>Prevenire mesaje repetitive rapide.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={protectionEnabled && field.value} onCheckedChange={field.onChange} disabled={!protectionEnabled} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="antiFloodEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Anti-Flood</FormLabel>
                        <FormDescription>Blocare mesaje gigantice (ziduri de text).</FormDescription>
                      </div>
                      <FormControl>
                      <Switch checked={protectionEnabled && field.value} onCheckedChange={field.onChange} disabled={!protectionEnabled} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Suspicious */}
            <div className="bg-card border border-border p-6 rounded-xl space-y-6">
              <div className="flex items-center gap-3 mb-4 border-b border-border pb-4">
                <AlertOctagon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-medium">Comportament Suspect</h3>
              </div>
              
              <FormField
                control={form.control}
                name="suspiciousEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Detectare Anomalii</FormLabel>
                      <FormDescription>Monitorizează schimbări rapide de nickname și roluri.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={protectionEnabled && field.value} onCheckedChange={field.onChange} disabled={!protectionEnabled} />
                    </FormControl>
                  </FormItem>
                )}
              />
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
