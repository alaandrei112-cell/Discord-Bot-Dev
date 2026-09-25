import { useRef, useState, type ChangeEvent, type Ref } from "react";
import { ImagePlus, Loader2, SmilePlus } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { DiscordGuildEmoji } from "../../hooks/use-moderation-api";
import { applyEmojiSelection } from "./emoji-utils";

const COMMON_EMOJIS = [
  "😀", "😂", "😍", "🥳", "😎", "🤔", "😭", "😡", "👍", "👎", "👏", "🙏",
  "✅", "❌", "⚠️", "ℹ️", "❤️", "💜", "🔥", "✨", "🎉", "🎁", "🏆", "⭐",
  "📣", "📊", "💬", "👥", "🚀", "🟢", "🔴", "🔊", "🛡️", "⚔️", "🔒", "🔑",
] as const;

type SharedProps = {
  value: string;
  onChange: (value: string) => void;
  emojis?: DiscordGuildEmoji[];
  guildId: string | null;
  csrfToken?: string;
  onEmojiCreated?: () => void | Promise<void>;
  replacement?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

export function EmojiField({
  value,
  onChange,
  emojis = [],
  guildId,
  csrfToken,
  onEmojiCreated,
  replacement = false,
  multiline = false,
  ...fieldProps
}: SharedProps) {
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const choose = (emoji: string) => {
    if (replacement) {
      onChange(emoji);
      setOpen(false);
      return;
    }
    const field = fieldRef.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? start;
    const selection = applyEmojiSelection(value, emoji, start, end, replacement);
    const next = selection.value;
    if (fieldProps.maxLength && next.length > fieldProps.maxLength) return;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(selection.caret, selection.caret);
    });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !guildId) return;
    setUploadError("");
    if (!["image/png", "image/jpeg", "image/gif"].includes(file.type) || file.size > 256 * 1024) {
      setUploadError("Folosește PNG, JPEG sau GIF de cel mult 256 KiB.");
      return;
    }
    const defaultName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    const name = window.prompt("Numele emoji-ului (2–32 litere, cifre sau _):", defaultName);
    if (!name) return;
    setUploading(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Fișierul nu a putut fi citit."));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`/api/moderation/guilds/${guildId}/emojis`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken || "" },
        body: JSON.stringify({ name, image }),
      });
      const payload = await response.json() as DiscordGuildEmoji & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Emoji-ul nu a putut fi creat.");
      await onEmojiCreated?.();
      choose(payload.markup);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Emoji-ul nu a putut fi creat.");
    } finally {
      setUploading(false);
    }
  };

  const control = multiline
    ? <Textarea ref={fieldRef as Ref<HTMLTextAreaElement>} value={value} onChange={(event) => onChange(event.target.value)} {...fieldProps} />
    : <Input ref={fieldRef as Ref<HTMLInputElement>} value={value} onChange={(event) => onChange(event.target.value)} {...fieldProps} />;

  return (
    <div className="relative">
      {control}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="absolute bottom-1.5 right-1.5 h-7 w-7" aria-label="Deschide selectorul de emoji">
            <SmilePlus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3 p-3" aria-label="Selector emoji">
          <div>
            <p className="mb-2 text-xs font-medium">Emoji comune</p>
            <div className="grid grid-cols-8 gap-1">
              {COMMON_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" className="h-8 rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => choose(emoji)} aria-label={`Inserează ${emoji}`}>
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium">Emoji de pe server</p>
            {emojis.length ? (
              <div className="grid max-h-32 grid-cols-8 gap-1 overflow-y-auto">
                {emojis.map((emoji) => (
                  <button key={emoji.id} type="button" className="flex h-8 items-center justify-center rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" onClick={() => choose(emoji.markup)} title={`:${emoji.name}:`} aria-label={`Inserează ${emoji.name}`}>
                    <img src={emoji.url} alt="" className="h-6 w-6 object-contain" />
                  </button>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">Serverul nu are emoji personalizate.</p>}
          </div>
          <div className="border-t pt-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif" className="sr-only" onChange={(event) => void upload(event)} />
            <Button type="button" size="sm" variant="outline" className="w-full" disabled={!guildId || uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              Creează emoji pe server
            </Button>
            {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const CUSTOM_EMOJI = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;

export function DiscordEmojiText({ children, emojis = [] }: { children: string; emojis?: DiscordGuildEmoji[] }) {
  const byId = new Map(emojis.map((emoji) => [emoji.id, emoji]));
  const parts: Array<string | { id: string; name: string }> = [];
  let last = 0;
  for (const match of children.matchAll(CUSTOM_EMOJI)) {
    parts.push(children.slice(last, match.index));
    parts.push({ id: match[3], name: match[2] });
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(children.slice(last));
  return <>{parts.map((part, index) => typeof part === "string" ? part : (
    <img key={`${part.id}-${index}`} src={byId.get(part.id)?.url || `https://cdn.discordapp.com/emojis/${part.id}.png?size=32&quality=lossless`} alt={`:${part.name}:`} className="mx-0.5 inline-block h-[1.25em] w-[1.25em] object-contain align-text-bottom" />
  ))}</>;
}