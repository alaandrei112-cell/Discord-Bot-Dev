import { Link } from "wouter";
import { trackEvent } from "../../lib/analytics";
import { DISCORD_INVITE } from "../../lib/public-constants";
import { Brand, Icon, StatusDot } from "./UiElements";

export function Footer({ health }: { health: any }) {
  return (
    <footer className="site-footer page-width">
      <div className="footer-top">
        <Brand footer />
        <span className="footer-motto">O lume creată pentru cei care aleg să lupte.</span>
        <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("discord_cta_click", { location: "footer" })} data-testid="link-footer-discord">
          discord.gg/regatulcenusii <Icon name="arrow" size={14} />
        </a>
      </div>
      <div className="footer-bottom">
        <span>REGATUL CENUȘII · O CRONICĂ VIE</span>
        <Link href="/moderare">Panou de moderare</Link>
        <a href="/#status" onClick={() => trackEvent("operator_status_open", { location: "footer" })} data-testid="link-footer-status">
          <StatusDot active={health?.botOnline ?? false} /> operator / stare live
        </a>
        <span>© {new Date().getFullYear()} — fără tron, doar povești</span>
      </div>
    </footer>
  );
}
