# Moderare — Oracolul Cenușii

Modulul de moderare este separat de joc. Oprirea jocului nu trebuie să oprească moderarea sau accesul staffului.

## Acces la panou

1. Deschide secțiunea **Moderare** din site (`/moderare`).
2. Apasă **Conectează-te cu Discord** și autorizează aplicația în pagina oficială Discord.
3. După revenirea pe site, selectează un server din lista disponibilă.
4. Sunt afișate numai serverele în care este prezent botul și în care ai acces de administrare/moderare. Sesiunea web expiră după opt ore.

Nu mai trebuie introdus niciun cod. Comanda `/moderare login` oferă un link către site. Accesul depinde de apartenența și permisiunile curente din Discord, nu doar de existența unei sesiuni web. Configurarea și auditul sunt rezervate proprietarului; acesta poate permite și administratorilor accesul la aceste secțiuni.

Botul este oprit intenționat în mediul de dezvoltare al acestui proiect. Autentificarea prin Discord necesită instanța botului conectată; pagina de autentificare din preview nu oferă un ocol al permisiunilor.

## Configurarea OAuth2 (o singură dată)

În [Discord Developer Portal](https://discord.com/developers/applications), selectează aplicația botului și deschide **OAuth2**:

- **Client ID** → `DISCORD_CLIENT_ID`.
- **Client Secret** → `DISCORD_CLIENT_SECRET`, păstrat exclusiv în Secrets, niciodată în frontend sau chat.
- În **Redirects**, adaugă exact adresa din `DISCORD_OAUTH_REDIRECT_URI`.

Adresa de revenire pentru site-ul public este:

`https://discord-bot-dev-alaandrei09.replit.app/api/moderation/oauth/discord/callback`

Valorile de revenire și `MODERATION_WEB_ORIGIN` sunt configurate separat pentru producție. Pentru login în preview este necesară o adresă de revenire de dezvoltare separată, adăugată și în portal. În lipsa configurării complete, site-ul afișează explicit că autentificarea nu este încă disponibilă. Nu se folosește tokenul botului în loc de Client Secret OAuth2.

Autorizarea solicită identitatea Discord și lista serverelor, nu parola Discord sau acces la e-mail. Tokenul OAuth este utilizat doar pe server; browserul primește sesiunea proprie a aplicației. Verificarea stării OAuth protejează revenirea din Discord împotriva autentificărilor inițiate din alt browser.

## Activare

Modulele automate sunt dezactivate implicit. Configurează întâi:

- rolurile protejate și rolurile staff;
- canalele ignorate/protejate și canalele pentru alerte;
- pragurile de detecție și acțiunea dorită pentru fiecare regulă;
- permisiunile botului și poziția rolului său în ierarhia Discord.

Activează apoi modulul și regulile sale individuale. O regulă activă dintr-un modul oprit nu trebuie să aplice sancțiuni. Intensitatea Soft/Normal/Hard modifică sensibilitatea detecției, nu transformă singură avertismentele în banuri. Escaladarea sancțiunilor se configurează separat.

## Comenzi staff

`/warn`, `/mute`, `/kick`, `/ban`, `/unmute`, `/purge`, `/slowmode`, `/lock`, `/unlock`, `/nick`, `/role`.

Comenzile verifică permisiunile, ierarhia actorului și a botului și protecțiile configurate. Permisiunile de canal se aplică și acțiunilor lansate din site. Comenzile sunt slash commands Discord: prefixul lor este `/`.

În site, pagina **Comenzi** permite executarea acelorași acțiuni pentru serverul selectat. Slowmode se configurează în **secunde**, între 0 și 21600; 0 îl dezactivează. Purge acceptă între 1 și 100 de mesaje. Numele canalelor și rolurilor provin din serverul Discord, nu dintr-o listă demonstrativă.

Lockdown salvează permisiunile anterioare ale canalului pentru restaurare prin `/unlock`. Verifică rezultatele pe fiecare canal; lipsa unei permisiuni nu trebuie interpretată ca blocare reușită.

## Cazuri, loguri și audit

- **Cazuri:** sancțiuni, motive, dovezi, notițe și stare deschis/închis.
- **Loguri:** activitatea de moderare pentru staff.
- **Audit:** modificările și activitatea administrativă, cu acces mai restrictiv.

O cerere aflată în curs sau cu rezultat incert nu trebuie relansată automat: verifică întâi starea efectivă în Discord. Discord și baza de date nu pot participa la aceeași tranzacție.

## Limitări Discord

- Filtrarea mesajelor obișnuite necesită acces la **Message Content**; evenimentele membrilor necesită **Server Members**. Intențiile privilegiate trebuie permise atât în Discord Developer Portal, cât și în configurarea instanței botului.
- Timeout-ul cere **Moderate Members**; kick, ban, ștergerea mesajelor, rolurile și canalele au permisiuni Discord distincte. Rolul botului trebuie să fie suficient de sus.
- Evenimentele de ștergere sau schimbare de rol nu identifică întotdeauna sigur autorul acțiunii. În lipsa unei atribuiri verificabile, sistemul trebuie să alerteze stafful, nu să sancționeze persoana afectată.
- Animațiile embed sunt imagini GIF găzduite la un URL HTTPS, nu animații arbitrare ale textului sau ale interfeței Discord.
- Clasificarea AI poate greși. Folosește inițial alerte sau avertismente și verifică rezultatele înainte de a activa sancțiuni mai severe.