import { useEffect, useState } from "react";
import { AlertTriangle, CircleHelp, Loader2, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Users } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ImageField } from "../../components/moderation/ImageField";
import { DiscordEmojiText, EmojiField } from "../../components/moderation/EmojiField";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  useActiveGuild,
  useBotControl,
  useModerationMetadata,
  useSession,
  useVerifiedMembers,
  type BotControlConfig,
} from "../../hooks/use-moderation-api";
import { useToast } from "../../hooks/use-toast";

const DEFAULT_VERIFICATION_TEXT = {
  title: "Verifică-ți contul",
  message: "Apasă butonul de mai jos pentru a confirma că deții contul Discord și pentru a primi rolul comunității.",
  buttonLabel: "Verifică-mă",
  buttonEmoji: "✅",
  successMessage: "Contul tău a fost verificat. Rolul a fost acordat.",
  alreadyVerifiedMessage: "Contul tău este deja verificat.",
  imageUrl: "",
  thumbnailUrl: "",
} as const;

function isTextChannel(type: number | string): boolean {
  return String(type) === "0" || type === "GuildText";
}

export function VerificationAdminPage() {
  const { guildId } = useActiveGuild();
  const { data, loading, error, update } = useBotControl(guildId);
  const { data: metadata, refetch: refetchMetadata } = useModerationMetadata(guildId);
  const {
    data: verifiedMembersData,
    loading: verifiedMembersLoading,
    error: verifiedMembersError,
    refetch: refetchVerifiedMembers,
  } = useVerifiedMembers(guildId);
  const { toast } = useToast();
  const { session } = useSession();
  const [draft, setDraft] = useState<BotControlConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [verificationSearch, setVerificationSearch] = useState("");

  useEffect(() => {
    setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
  }, [data]);

  const hasUnsavedChanges = Boolean(
    data && draft && JSON.stringify(draft) !== JSON.stringify(data),
  );

  const setVerification = (
    field: keyof BotControlConfig["verification"],
    value: string | boolean,
  ) => {
    setDraft((current) => current ? {
      ...current,
      verification: { ...current.verification, [field]: value },
    } : current);
  };

  const resetVerificationText = () => {
    setDraft((current) => current ? {
      ...current,
      verification: { ...current.verification, ...DEFAULT_VERIFICATION_TEXT },
    } : current);
  };

  const openBotInvite = async () => {
    if (!guildId) return;
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/moderation/guilds/${guildId}/verification/invite`, {
        credentials: "include",
      });
      const payload = await response.json() as { inviteUrl?: string; error?: string };
      if (!response.ok || !payload.inviteUrl) {
        throw new Error(payload.error ?? "Linkul de autorizare nu este disponibil.");
      }
      window.open(payload.inviteUrl, "_blank", "noopener,noreferrer");
    } catch (inviteError) {
      toast({
        variant: "destructive",
        title: "Autorizarea botului a eșuat",
        description: inviteError instanceof Error ? inviteError.message : "Încearcă din nou.",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const save = async () => {
    if (!draft || !hasUnsavedChanges) return;
    setSaving(true);
    try {
      await update({
        ...draft,
        channels: Object.fromEntries(Object.entries(draft.channels).filter(([, value]) => value)),
      });
      toast({
        title: "Verificarea a fost salvată",
        description: "Configurația Discord și asocierea cu site-ul sunt persistente.",
      });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: "Salvarea a eșuat",
        description: saveError instanceof Error ? saveError.message : "Încearcă din nou.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return <div className="flex justify-center p-12 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!draft) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {error?.message ?? "Setările verificării nu au putut fi încărcate."}
      </div>
    );
  }

  const textChannels = metadata?.channels.filter((channel) => isTextChannel(channel.type)) ?? [];
  const normalizedSearch = verificationSearch.trim().toLocaleLowerCase("ro");
  const filteredVerifiedMembers = (verifiedMembersData?.members ?? []).filter((member) => {
    if (!normalizedSearch) return true;
    return [member.displayName, member.username, member.id]
      .some((value) => value.toLocaleLowerCase("ro").includes(normalizedSearch));
  });

  return (
    <div className={`bot-control-page verification-admin-page max-w-5xl space-y-6 animate-stagger-1 ${hasUnsavedChanges ? "pb-28" : ""}`}>
      <header className="bot-control-hero animate-stagger-2">
        <div>
          <div className="bot-control-brand-row">
            <span className="bot-control-brand-mark"><ShieldCheck className="h-4 w-4" /></span>
            <p className="mod-eyebrow">MEMBER GATE</p>
          </div>
          <h1 className="mod-heading text-4xl">Verificare membri</h1>
          <p>Configurează verificarea Discord + site și urmărește membrii care au primit rolul.</p>
        </div>
        <div className="bot-control-status" data-state={draft.verification.enabled ? "online" : "offline"}>
          <span className="bot-control-status-dot" />
          <div>
            <strong>{draft.verification.enabled ? "Verificarea este activă" : "În configurare"}</strong>
            <small>{draft.verification.enabled ? "Panoul poate fi folosit pe Discord" : "Activează și salvează configurația"}</small>
          </div>
        </div>
      </header>

      {!draft.verification.enabled && (
        <div className="bot-control-banner animate-stagger-3" role="status">
          <AlertTriangle className="shrink-0" size={15} />
          <div>
            <strong>Fluxul nu este activ.</strong>{" "}
            Completează canalul și rolul, apoi salvează verificarea pentru a publica panoul pe Discord.
          </div>
          <button
            type="button"
            onClick={() => toast({ title: "Verificarea este în configurare", description: "Alege canalul și rolul, apoi apasă Salvează verificarea." })}
            className="bot-control-banner-help"
          >
            <CircleHelp size={13} /> Detalii
          </button>
        </div>
      )}

      <section className="mod-card space-y-5 p-5 animate-stagger-4">
        <div className="verification-section-head flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="mod-eyebrow">CONFIGURAȚIE</p>
              <h2 className="font-semibold text-foreground text-lg">Verificare Discord + site</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Membrul confirmă identitatea prin Discord, primește rolul ales și rămâne asociat cu sesiunea de verificare a site-ului.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer bg-secondary/40 px-3 py-2 rounded-lg border border-border/60 hover:bg-secondary transition-colors">
            <input
              type="checkbox"
              checked={draft.verification.enabled}
              onChange={(event) => setVerification("enabled", event.target.checked)}
              className="accent-primary"
            />
            Activ
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Canalul panoului</label>
            <Select
              value={textChannels.some((channel) => channel.id === draft.verification.channelId)
                ? draft.verification.channelId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "channelId",
                value === "__manual__" ? draft.verification.channelId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege canal" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {textChannels.map((channel) => <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.channelId}
              placeholder="ID canal Discord"
              onChange={(event) => setVerification("channelId", event.target.value.trim())}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rolul acordat</label>
            <Select
              value={metadata?.roles.some((role) => role.id === draft.verification.roleId && !role.managed)
                ? draft.verification.roleId
                : "__manual__"}
              onValueChange={(value) => setVerification(
                "roleId",
                value === "__manual__" ? draft.verification.roleId : value,
              )}
            >
              <SelectTrigger className="mod-select-trigger"><SelectValue placeholder="Alege rol" /></SelectTrigger>
              <SelectContent className="max-h-[min(70vh,32rem)] overscroll-contain">
                <SelectItem value="__manual__">ID introdus manual</SelectItem>
                {metadata?.roles.filter((role) => !role.managed).map((role) => (
                  <SelectItem key={role.id} value={role.id}>@{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={draft.verification.roleId}
              placeholder="ID rol Discord"
              onChange={(event) => setVerification("roleId", event.target.value.trim())}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-border pt-5">
          <div>
            <h3 className="font-medium">Panoul de verificare</h3>
            <p className="text-xs text-muted-foreground">Editează mesajul publicat în canal. Salvarea republică panoul dacă botul este online.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1" onClick={resetVerificationText}>
            <RotateCcw className="h-3.5 w-3.5" /> Implicit
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Titlu</span>
              <EmojiField maxLength={256} value={draft.verification.title} onChange={(value) => setVerification("title", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Emoji buton</span>
              <EmojiField replacement maxLength={100} value={draft.verification.buttonEmoji} placeholder="✅" onChange={(value) => setVerification("buttonEmoji", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs font-medium">Descriere</span>
              <EmojiField multiline rows={5} maxLength={4000} value={draft.verification.message} onChange={(value) => setVerification("message", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <ImageField
              label="Thumbnail mic (dreapta sus)"
              value={draft.verification.thumbnailUrl}
              guildId={guildId}
              csrfToken={session?.csrfToken}
              onChange={(value) => setVerification("thumbnailUrl", value)}
            />
            <ImageField
              label="Imaginea panoului de verificare"
              value={draft.verification.imageUrl}
              guildId={guildId}
              csrfToken={session?.csrfToken}
              onChange={(value) => setVerification("imageUrl", value)}
            />
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Text buton</span>
              <EmojiField maxLength={80} value={draft.verification.buttonLabel} onChange={(value) => setVerification("buttonLabel", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium">Mesaj după verificare</span>
              <EmojiField maxLength={2000} value={draft.verification.successMessage} onChange={(value) => setVerification("successMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-xs font-medium">Mesaj dacă este deja verificat</span>
              <EmojiField multiline rows={3} maxLength={2000} value={draft.verification.alreadyVerifiedMessage} onChange={(value) => setVerification("alreadyVerifiedMessage", value)} guildId={guildId} csrfToken={session?.csrfToken} emojis={metadata?.emojis} onEmojiCreated={refetchMetadata} />
            </label>
          </div>
          <div className="self-start rounded-xl border border-[#5865f2]/40 bg-[#202225] p-4 text-[#f2f3f5] shadow-lg">
            <p className="mb-3 text-[10px] font-semibold tracking-[0.18em] text-[#949cf7]">PREVIZUALIZARE DISCORD</p>
            <div className="overflow-hidden rounded-lg border-l-4 border-[#5865f2] bg-[#2b2d31]">
              <div className="p-4">
                {draft.verification.thumbnailUrl && (
                  <img
                    src={draft.verification.thumbnailUrl}
                    alt="Previzualizarea thumbnail-ului panoului"
                    className="float-right ml-3 h-20 w-20 rounded object-cover"
                  />
                )}
                <h3 className="text-lg font-semibold"><DiscordEmojiText emojis={metadata?.emojis}>{draft.verification.title || "Titlul panoului"}</DiscordEmojiText></h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[#b5bac1]"><DiscordEmojiText emojis={metadata?.emojis}>{draft.verification.message || "Descrierea panoului"}</DiscordEmojiText></p>
                {draft.verification.imageUrl && (
                  <img
                    src={draft.verification.imageUrl}
                    alt="Previzualizarea imaginii panoului"
                    className="mt-3 max-h-52 w-full rounded object-contain"
                  />
                )}
                <Button type="button" className="mt-4 bg-[#5865f2] text-white hover:bg-[#4752c4]">
                  <DiscordEmojiText emojis={metadata?.emojis}>{`${draft.verification.buttonEmoji} ${draft.verification.buttonLabel || "Verifică-mă"}`}</DiscordEmojiText>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
          <div>
            <p className="text-sm font-medium">Pasul administratorului</p>
            <p className="text-xs text-muted-foreground">Botul trebuie să fie instalat pe server și să aibă rolul botului deasupra rolului de verificare.</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void openBotInvite()} disabled={inviteLoading}>
            {inviteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Autorizează / invită botul
          </Button>
        </div>
      </section>

      <section className="verification-surface verification-members-surface space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Users className="mt-1 h-5 w-5 text-primary" />
            <div>
              <p className="mod-eyebrow">MEMBER DIRECTORY</p>
              <h2 className="font-medium">Membri verificați</h2>
              <p className="text-xs text-muted-foreground">Lista live a membrilor care au în prezent rolul de verificare configurat.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-medium">
              {verifiedMembersData?.total ?? 0} membri
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetchVerifiedMembers()}
              disabled={verifiedMembersLoading}
              title="Reîncarcă lista"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${verifiedMembersLoading ? "animate-spin" : ""}`} />
              Reîncarcă
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={verificationSearch}
            onChange={(event) => setVerificationSearch(event.target.value)}
            placeholder="Caută după nume, username sau ID Discord"
            aria-label="Caută membri verificați"
            className="pl-9"
          />
        </div>

        {verifiedMembersLoading && !verifiedMembersData ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se încarcă membrii verificați…
          </div>
        ) : verifiedMembersError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {verifiedMembersError.message}
          </div>
        ) : !draft.verification.roleId ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Configurează și salvează rolul de verificare pentru a vedea membrii.
          </div>
        ) : filteredVerifiedMembers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {verificationSearch.trim() ? "Nu există membri care corespund căutării." : "Nu există membri verificați în acest moment."}
          </div>
        ) : (
          <div className="verification-table-wrap overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Membru</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">ID Discord</th>
                  <th className="px-4 py-3 font-medium">În server din</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredVerifiedMembers.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={member.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-muted object-cover" />
                        <span className="font-medium">{member.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">@{member.username}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{member.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("ro-RO") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hasUnsavedChanges && (
        <div className="mod-save-bar sticky bottom-3 z-20 flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-muted-foreground font-medium text-sm">
            <span className={`bot-control-save-dot ${saving ? "is-saving" : ""}`} />
            <span>{saving ? "Se salvează verificarea…" : "Ai modificări nesalvate."}</span>
          </div>
          <div className="mod-save-actions ml-auto">
            <Button onClick={() => void save()} disabled={saving} className="gap-2 px-8 font-semibold tracking-wide shadow-lg shadow-primary/20">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Se salvează…" : "Salvează verificarea"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}