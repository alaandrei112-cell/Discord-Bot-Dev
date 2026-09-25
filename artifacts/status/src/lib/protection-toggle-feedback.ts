export type ProtectionToggleNoticeStatus =
  | "not_applicable"
  | "sent"
  | "no_channel"
  | "bot_offline"
  | "guild_unavailable"
  | "channel_unavailable"
  | "send_failed";

export function protectionToggleToastOptions(
  enabled: boolean,
  status?: ProtectionToggleNoticeStatus,
  existingDescription?: string,
): { title: string; description?: string } {
  const description = (notice: string) =>
    [existingDescription?.trim(), notice].filter(Boolean).join(" ");

  if (!enabled) {
    return { title: "Modul dezactivat", description: existingDescription };
  }

  switch (status) {
    case "sent":
      return { title: "Modul activat", description: description("Anunțul a fost trimis în canalul de audit.") };
    case "no_channel":
      return {
        title: "Modul activat, fără anunț",
        description: "Configurează canalul de audit din setările moderării pentru a primi anunțuri pe Discord.",
      };
    case "bot_offline":
      return {
        title: "Modul activat, fără anunț",
        description: "Botul Discord nu este conectat. Anunțul nu a putut fi trimis.",
      };
    case "guild_unavailable":
      return {
        title: "Modul activat, fără anunț",
        description: "Botul nu poate accesa serverul Discord selectat.",
      };
    case "channel_unavailable":
      return {
        title: "Modul activat, fără anunț",
        description: "Canalul de audit nu este disponibil sau botul nu poate scrie în el.",
      };
    case "send_failed":
      return {
        title: "Modul activat, fără anunț",
        description: "Discord nu a acceptat mesajul. Verifică accesul botului la canalul de audit.",
      };
    default:
      return { title: "Modul activat", description: existingDescription };
  }
}

export function configSaveToastOptions(
  status: ProtectionToggleNoticeStatus | undefined,
  title: string,
  existingDescription: string,
): { title: string; description: string } {
  if (!status || status === "not_applicable") return { title, description: existingDescription };
  if (status === "sent") {
    return {
      title,
      description: [existingDescription, "Anunțul a fost trimis în canalul de audit."].filter(Boolean).join(" "),
    };
  }
  const notice = protectionToggleToastOptions(true, status);
  return {
    title: "Setările au fost salvate, dar anunțul nu a fost trimis",
    description: [existingDescription, notice.description].filter(Boolean).join(" "),
  };
}