// Slash-command handlers for admin-facing Oracle powers:
//   /blestem @jucator — instantly curse a player (any Discord admin)
//   /admin ghid       — ephemeral guide listing all admin commands + Oracle tag phrases

import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { logger } from "../lib/logger";
import { grantRandomCurse } from "./status-effects";
import { THEME_COLOR, BRAND_FOOTER } from "./survival";

/**
 * /blestem @jucator
 * Applies a random Oracle curse directly to the target player.
 * Available to any Discord Administrator (gated via setDefaultMemberPermissions in index.ts).
 */
export async function handleBlestem(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const target = interaction.options.getUser("jucator", true);

  if (target.bot) {
    await interaction.editReply({ content: "Oracolul refuză să blesteme un spirit artificial." });
    return;
  }

  const curse = grantRandomCurse(target.id);

  const ch = interaction.channel;
  if (ch && "send" in ch) {
    await ch.send({
      content:
        `*Oracolul ridică mâna, ochii îi strălucesc în cenușiu…*\n\n` +
        `🩸 <@${target.id}> a primit **${curse.emoji} ${curse.label}** — ` +
        `${curse.flavor ?? "blestemul cade asupra ta"}.\n` +
        `*Nimeni nu scapă de judecata Cenușii.*`,
      allowedMentions: { users: [target.id] },
    });
  }

  await interaction.editReply({ content: "✅ Blestemul a fost aplicat." });

  logger.info(
    { adminId: interaction.user.id, targetId: target.id, curse: curse.id },
    "Oracle blestem: admin curse applied",
  );
}

/**
 * /admin ghid
 * Ephemeral embed listing every admin slash command and Oracle @-mention phrase.
 * Available to any Discord Administrator (no guild-owner restriction).
 */
export async function handleAdminGhid(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [
      {
        color: THEME_COLOR,
        title: "📖 Ghidul Administratorului — Regatul Cenușii",
        description:
          "Toate comenzile rezervate adminilor și combinațiile cu Oracolul. Mesaj vizibil doar pentru tine.",
        fields: [
          {
            name: "👑 Comenzi Slash — Doar Owner (creatorul serverului)",
            value:
              "**/startevent** — Pornește manual Ora Umbrelor\n" +
              "**/cufar** `[raritate] [tip] [cheie] [multiplicator]` — Generează un cufăr cu Oboli\n" +
              "**/spawnboss** — Invocă Dragonul Stins pentru test\n" +
              "**/admin offline** — Trece botul în modul invizibil\n" +
              "**/admin online** — Readuce botul online\n" +
              "**/admin restart** — Repornește botul\n" +
              "**/admin status** — Uptime, boss activ și stare generală",
          },
          {
            name: "🛡️ Comenzi Slash — Orice Administrator Discord",
            value:
              "**/blestem @jucator** — Oracolul aplică imediat un blestem aleator asupra jucătorului ales\n" +
              "**/admin ghid** — Această listă (vizibilă doar pentru tine)",
          },
          {
            name: "🔮 @Oracle + frază — Dreptate (scanează canalul, mută + blestemă automat)",
            value:
              "*(Disponibil doar pentru owner)*\n" +
              "`@Oracle fa dreptate`\n" +
              "`@Oracle face dreptate`\n" +
              "`@Oracle judeca-i` / `judecati`\n" +
              "`@Oracle penalizeaza` / `penalizeaza-i`\n" +
              "`@Oracle curata canalul`\n" +
              "`@Oracle fa ordine`\n" +
              "`@Oracle aplica blestemul`\n" +
              "`@Oracle pedepseste` / `pedepseste-i`\n" +
              "`@Oracle executa dreptatea` / `executa judecata`",
          },
          {
            name: "🕊️ @Oracle + frază — Iertare (ridică blestemele de pe @utilizator menționat)",
            value:
              "*(Disponibil doar pentru owner)*\n" +
              "`@Oracle iarta @utilizator` / `iarta-l` / `iarta-o`\n" +
              "`@Oracle iertare @utilizator`\n" +
              "`@Oracle gratiaza @utilizator` / `gratiaza-l` / `gratiaza-o`\n" +
              "`@Oracle reseteaza blestemul @utilizator`\n" +
              "`@Oracle ridica blestemul @utilizator`\n" +
              "`@Oracle ridica pedeapsa @utilizator`\n" +
              "`@Oracle pardoneaza @utilizator` / `pardoneaza-l` / `pardoneaza-o`",
          },
          {
            name: "ℹ️ Note",
            value:
              "• Combinațiile cu **@Oracle** funcționează doar în canale text normale.\n" +
              "• **Dreptatea** scanează ultimele mesaje din ultimele 30 minute (implicit) — configurabil din env.\n" +
              "• **Blestemele** aplicate manual durează 8 minute și afectează Obolii sau șansa critică.\n" +
              "• **Timeouturile** necesită ca botul să aibă rolul deasupra jucătorului vizat.",
          },
        ],
        footer: { text: BRAND_FOOTER },
      },
    ],
  });
}
