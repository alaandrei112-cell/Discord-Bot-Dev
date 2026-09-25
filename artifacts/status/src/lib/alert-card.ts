export interface OracleHealthAlertInput {
  alertsConfigured: boolean;
  alertThresholdMs: number;
}

export interface AlertCardResult {
  tone: "loading" | "ok" | "danger";
  label: string;
  detail: string;
}

export function computeAlertCard(health: OracleHealthAlertInput | null): AlertCardResult {
  if (health === null) {
    return {
      tone: "loading",
      label: "Se verifică…",
      detail: "Se interoghează /api/healthz.",
    };
  }

  if (health.alertsConfigured) {
    const thresholdSec = Math.round(health.alertThresholdMs / 1000);
    const thresholdLabel =
      thresholdSec >= 60
        ? `${Math.round(thresholdSec / 60)}m`
        : `${thresholdSec}s`;
    return {
      tone: "ok",
      label: "Alerte: ACTIVE",
      detail: `Webhook configurat. Alertele de deconectare se trimit după ${thresholdLabel} de inactivitate.`,
    };
  }

  return {
    tone: "danger",
    label: "Alerte: OPRITE",
    detail:
      "DISCORD_ALERT_WEBHOOK_URL nu este setat. Nu vei fi notificat de nicio deconectare sau recuperare.",
  };
}
