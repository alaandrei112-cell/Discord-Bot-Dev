import { useEffect, useRef, useState } from "react";
import { DragonLogo, Icon } from "../../components/public/UiElements";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { useLocation } from "wouter";

type PublicServerProfile = {
  name: string;
  iconUrl: string | null;
  inviteUrl: string;
};

export function GameGuidePage() {
  const [, setLocation] = useLocation();
  const activeSectionRef = useRef<string>("profil");
  const [serverProfile, setServerProfile] = useState<PublicServerProfile>({
    name: "Regatul Cenușii",
    iconUrl: null,
    inviteUrl: DISCORD_INVITE,
  });

  useEffect(() => {
    let mounted = true;
    void fetch("/api/moderation/public/server-profile", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<PublicServerProfile> : null)
      .then((profile) => {
        if (mounted && profile?.name && profile.inviteUrl) setServerProfile(profile);
      })
      .catch(() => {
        // Keep the configured public identity when Discord is temporarily unavailable.
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const originalTitle = document.title;
    
    // Read meta tags to restore later
    const metaDesc = document.querySelector('meta[name="description"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    
    const originalDesc = metaDesc?.getAttribute("content") ?? "";
    const originalOgTitle = ogTitle?.getAttribute("content") ?? "";
    const originalOgDesc = ogDesc?.getAttribute("content") ?? "";

    // Set new metadata
    document.title = "Detalii server | Regatul Cenușii";
    if (metaDesc) metaDesc.setAttribute("content", "Descoperă serverul Regatul Cenușii pe Discord și află cum funcționează aventura RPG, comenzile, clasele și evenimentele.");
    if (ogTitle) ogTitle.setAttribute("content", "Detalii server | Regatul Cenușii");
    if (ogDesc) ogDesc.setAttribute("content", "Descoperă serverul Regatul Cenușii pe Discord și află cum funcționează aventura RPG, comenzile, clasele și evenimentele.");
    
    return () => {
      document.title = originalTitle;
      if (metaDesc) metaDesc.setAttribute("content", originalDesc);
      if (ogTitle) ogTitle.setAttribute("content", originalOgTitle);
      if (ogDesc) ogDesc.setAttribute("content", originalOgDesc);
    };
  }, []);
  
  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (element) {
      element.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      activeSectionRef.current = id;
      
      // Update UI state manually since we are intercepting the hash click
      document.querySelectorAll('.guide-nav-link').forEach(link => link.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      // Update url without jump
      window.history.pushState(null, "", `/joc#${id}`);
    }
  };

  return (
    <div className="game-guide-page page-width">
      <div className="game-guide-header">
        <div className="eyebrow"><span className="eyebrow-line" /> Inițiere în Cenușă</div>
        <h1>Cum se joacă.</h1>
        <p>Regatul Cenușii este o experiență RPG complet integrată în Discord. Nu ai nevoie de alte aplicații sau site-uri. Aici găsești comenzile și mecanicile de bază pentru a supraviețui.</p>
      </div>

      <div className="guide-grid">
        <aside className="guide-sidebar">
          <a href="#server" onClick={(e) => handleNavClick(e, 'server')} className="guide-nav-link active"><Icon name="crown" size={14} /> Detalii server</a>
          <a href="#profil" onClick={(e) => handleNavClick(e, 'profil')} className="guide-nav-link"><Icon name="mark" size={14} /> Crearea caracterului</a>
          <a href="#clase" onClick={(e) => handleNavClick(e, 'clase')} className="guide-nav-link"><Icon name="shield" size={14} /> Clasele regatului</a>
          <a href="#lupta" onClick={(e) => handleNavClick(e, 'lupta')} className="guide-nav-link"><Icon name="sword" size={14} /> Luptă și Evenimente</a>
          <a href="#economie" onClick={(e) => handleNavClick(e, 'economie')} className="guide-nav-link"><Icon name="chest" size={14} /> Progresie și Economie</a>
          <a href="#comenzi" onClick={(e) => handleNavClick(e, 'comenzi')} className="guide-nav-link"><Icon name="book" size={14} /> Lista de comenzi</a>
          
          <a
            href={serverProfile.inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="guide-server-card"
            onClick={() => trackEvent("discord_cta_click", { location: "guide_server_card" })}
          >
            <span className="guide-server-card__logo">
              {serverProfile.iconUrl ? (
                <img src={serverProfile.iconUrl} alt="" />
              ) : (
                <DragonLogo className="guide-server-card__fallback-logo" />
              )}
            </span>
            <span className="guide-server-card__copy">
              <span className="guide-server-card__eyebrow">Serverul oficial</span>
              <strong>{serverProfile.name}</strong>
              <span className="guide-server-card__invite">{serverProfile.inviteUrl.replace(/^https?:\/\//, "")}</span>
            </span>
            <Icon name="arrow" size={15} />
          </a>
        </aside>

        <div className="guide-content">
          <section id="server" className="guide-section guide-server-details" data-aos="flip-left">
            <h2><Icon name="crown" size={28} /> Detalii server</h2>
            <div className="guide-server-details-card">
              <span className="guide-server-details-card__logo">
                {serverProfile.iconUrl ? (
                  <img src={serverProfile.iconUrl} alt="" />
                ) : (
                  <DragonLogo className="guide-server-details-card__fallback-logo" />
                )}
              </span>
              <div className="guide-server-details-card__copy">
                <span className="guide-server-card__eyebrow">Comunitate RPG pe Discord</span>
                <h3>{serverProfile.name}</h3>
                <p>Intră în regat pentru lupte, evenimente, clase, progresie și o comunitate care își scrie propria poveste.</p>
                <a
                  href={serverProfile.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button--primary guide-server-details-card__button"
                  onClick={() => trackEvent("discord_cta_click", { location: "server_details" })}
                >
                  Intră pe server <Icon name="arrow" size={15} />
                </a>
              </div>
              <div className="guide-server-details-card__meta">
                <span>Invitație</span>
                <strong>{serverProfile.inviteUrl.replace(/^https?:\/\//, "")}</strong>
              </div>
            </div>
          </section>

          <section id="profil" className="guide-section" data-aos="flip-left">
            <h2><Icon name="mark" size={28} /> Crearea caracterului</h2>
            <p>Primul tău pas în regat. Pentru a-ți începe povestea, intră pe orice canal permis din serverul de Discord și folosește comanda de profil. Acest lucru îți va genera automat un erou.</p>
            <div className="guide-card-grid">
              <div className="guide-card">
                <h3><span className="guide-command">/profil</span> Inspectare</h3>
                <p>Creează eroul (dacă nu există) și afișează statusul tău actual: nivel, clasă, statisticile de bază și experiența adunată în lupte.</p>
              </div>
            </div>
          </section>

          <section id="clase" className="guide-section" data-aos="flip-left">
            <h2><Icon name="shield" size={28} /> Clasele regatului</h2>
            <p>Eroul tău are nevoie de o specializare. Folosește <span className="guide-command">/clasa</span> pentru a alege una dintre cele cinci căi disponibile. După selecția inițială, schimbarea clasei va necesita un obiect din magazin.</p>
            <div className="guide-card-grid">
              <div className="guide-card">
                <h3>Cavaler</h3>
                <p>Armură grea și forță brută. Primul în linia de foc, capabil să încaseze lovituri care i-ar doborî pe alții.</p>
              </div>
              <div className="guide-card">
                <h3>Umbrolog</h3>
                <p>Stăpân al magiei întunecate și al esenței de cenușă. Lovește devastator din umbră.</p>
              </div>
              <div className="guide-card">
                <h3>Străjer</h3>
                <p>Rapid, letal și echilibrat. Un apărător al hotarelor care lovește precis înainte ca inamicul să reacționeze.</p>
              </div>
              <div className="guide-card">
                <h3>Alchimist</h3>
                <p>Arta preparatelor și a remediilor. Vital pentru grup, capabil să întoarcă soarta unei bătălii de durată.</p>
              </div>
              <div className="guide-card">
                <h3>Rătăcitor</h3>
                <p>Un supraviețuitor singuratic adaptat la asprimea regatului. Versatil, letal, greu de prins.</p>
              </div>
            </div>
            <p style={{ marginTop: '1.5rem' }}>Nu există o mecanică directă de alegere a facțiunilor. Veghetorii Nordului, Cronicarii de Sare și Fiii Fumului reprezintă jurămintele de suflet (lore), iar <strong>/fratie</strong> este modul în care comunitatea votează și se guvernează, nu o aliniere strictă de combat.</p>
          </section>

          <section id="lupta" className="guide-section" data-aos="flip-left">
            <h2><Icon name="sword" size={28} /> Luptă și Evenimente</h2>
            <p>Bătăliile se nasc natural din neantul regatului, declanșate automat de evenimente pe canal. Nu există o comandă pe care să o apelezi pentru a genera un atac.</p>
            <div className="guide-card-grid">
              <div className="guide-card">
                <h3>Chemarea la luptă</h3>
                <p>Monștrii și evenimentele apar automat. Urmărește mesajele Oracolului. Când o bătălie începe, folosește butoanele interactive atașate mesajului pentru a te alătura și a ataca.</p>
              </div>
              <div className="guide-card">
                <h3>Dragonul Stins</h3>
                <p>Cel mai de temut adversar al regatului. Un boss de echipă (raid) care necesită coordonarea întregii comunități pentru a fi doborât.</p>
              </div>
              <div className="guide-card">
                <h3>Ranguri Veterane</h3>
                <p>Boșii capătă niveluri veterane pe serverele foarte active. Dificultatea devine extremă pentru a oferi provocări comunităților de cursă lungă.</p>
              </div>
            </div>
          </section>

          <section id="economie" className="guide-section" data-aos="flip-left">
            <h2><Icon name="chest" size={28} /> Progresie și Economie</h2>
            <p>Luptele aduc glorie, dar pentru a supraviețui vei avea nevoie de resurse, echipament și un inventar bine pus la punct.</p>
            <div className="guide-card-grid">
              <div className="guide-card">
                <h3><span className="guide-command">/inventar</span> Echipament</h3>
                <p>Afișează armele, armurile, materialele brute și componentele de bază pe care le deții.</p>
              </div>
              <div className="guide-card">
                <h3><span className="guide-command">/magazin</span> Comerț</h3>
                <p>Deschide prăvălia regatului. Folosește comanda pentru a cumpăra noi puteri, licori, obiecte consumabile și de reset (precum resetarea clasei).</p>
              </div>
              <div className="guide-card">
                <h3><span className="guide-command">/cufarpersonal</span> Recompensă Zilnică</h3>
                <p>Îți acordă cufărul tău zilnic de provizii. Nu uita să-l revendici pentru a te menține în formă.</p>
              </div>
              <div className="guide-card">
                <h3>Chei și Fragmente</h3>
                <p>Folosește <span className="guide-command">/chei</span> pentru a vedea inventarul de chei. Poți purifica cheile corupte cu <span className="guide-command">/purificacheie</span> și poți schimba fragmente duplicate cu altele similare folosind <span className="guide-command">/schimbrelicve</span>.</p>
              </div>
            </div>
          </section>

          <section id="comenzi" className="guide-section" data-aos="flip-left">
            <h2><Icon name="book" size={28} /> Lista de comenzi</h2>
            <p>Un rezumat rapid al comenzilor esențiale pe care le poți folosi în Discord:</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/profil</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Creează sau afișează caracterul tău, clasele și xp-ul curent.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/clasa</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Alege specializarea ta inițială (Cavaler, Umbrolog etc).</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/ajutor</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Afișează manualul interactiv cu regulile jocului.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/inventar</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Afișează posesia de arme, armuri și materiale.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/magazin</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Deschide magazinul pentru puteri, consumabile și reseturi.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/cufarpersonal</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Deschide cufărul zilnic de recompensă.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/chei</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Afișează statusul cheilor din inventarul tău.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/purificacheie</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Curăță o cheie de corupție folosind resurse.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/schimbrelicve</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Schimbă un fragment duplicat cu un alt fragment.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: 'rgba(25,21,22,0.6)', borderRadius: '4px', border: '1px solid var(--line)' }}>
                <span className="guide-command" style={{ margin: 0, minWidth: '130px', textAlign: 'center' }}>/fratie</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--paper-soft)' }}>Participă la viața și voturile comunității.</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
