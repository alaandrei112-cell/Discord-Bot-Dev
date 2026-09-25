import { computeAlertCard } from "../../lib/alert-card";
import { Icon } from "../../components/public/UiElements";
import { formatUptime } from "../../lib/utils-public";
import { useOracleHealth } from "../../hooks/public/use-health";
import { API_BASE } from "../../lib/public-constants";

export function OperatorHealthPage() {
  const health = useOracleHealth();
  const botTone = health === null ? "loading" : health.botOnline ? "ok" : "danger";
  const botLabel = health === null ? "Se verifică…" : health.botOnline ? "Online" : "Offline";
  
  let replyTone: "loading" | "ok" | "warn" | "danger";
  let replyLabel: string;
  let replyDetail: string;
  
  if (health === null) { 
    replyTone = "loading"; 
    replyLabel = "Se verifică…"; 
    replyDetail = "Se interoghează /api/healthz."; 
  } else if (health.oracleReplyMode === "full") { 
    replyTone = "ok"; 
    replyLabel = "Complet (active)"; 
    replyDetail = "Răspunde la fiecare reply, mențiune și ping."; 
  } else if (health.oracleReplyReason === "portal_toggle_missing") { 
    replyTone = "danger"; 
    replyLabel = "Redus (portal_toggle_missing)"; 
    replyDetail = "Comutatorul „Message Content” lipsește din Developer Portal. Activează-l, apoi repornește botul."; 
  } else { 
    replyTone = "warn"; 
    replyLabel = "Redus (disabled)"; 
    replyDetail = "Răspunsul la toate reply-urile este dezactivat din configurare."; 
  }
  
  const { tone: alertTone, label: alertLabel, detail: alertDetail } = computeAlertCard(health);
  
  return (
    <div className="ops-page">
      <div className="ops-panel">
        <header className="ops-head">
          <a className="ops-back" href="/">← Înapoi la pagina principală</a>
          <h1 className="ops-title"><Icon name="mark" size={22} /> Starea operatorului</h1>
          <p className="ops-sub">{health === null ? "Nu se poate contacta /api/healthz." : "Date live · reîmprospătare la 15 secunde"}</p>
        </header>
        <div className="ops-grid">
          <div className={`ops-card ops-card--${botTone}`}>
            <span className="ops-card-label">Bot Discord</span>
            <span className="ops-card-value"><span className="ops-dot" />{botLabel}</span>
          </div>
          <div className="ops-card">
            <span className="ops-card-label">Shard</span>
            <span className="ops-card-value">{health?.shardStatus ?? "—"}</span>
          </div>
          <div className="ops-card">
            <span className="ops-card-label">Uptime bot</span>
            <span className="ops-card-value">{health ? formatUptime(health.botUptime) : "…"}</span>
          </div>
          <div className={`ops-card ops-card--${replyTone}`}>
            <span className="ops-card-label">Mod răspuns</span>
            <span className="ops-card-value"><span className="ops-dot" />{replyLabel}</span>
            <span className="ops-card-detail">{replyDetail}</span>
          </div>
          <div className={`ops-card ops-card--${alertTone}`}>
            <span className="ops-card-label">Alerte push</span>
            <span className="ops-card-value"><span className="ops-dot" />{alertLabel}</span>
            <span className="ops-card-detail">{alertDetail}</span>
          </div>
        </div>
        <footer className="ops-foot">
          <a href={`${API_BASE}/api/healthz`} target="_blank" rel="noopener noreferrer">Vezi JSON brut</a>
          <a href="/">Pagina principală →</a>
        </footer>
      </div>
    </div>
  );
}
