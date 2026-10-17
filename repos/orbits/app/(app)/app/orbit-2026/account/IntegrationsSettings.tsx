"use client";

import { useEffect, useState } from "react";

import type { IntegrationAuthorization, OrbitIntegrationProvider } from "../../../../../features/integrations/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Button, Card, Chip, ConfirmDialog, useToast } from "../ui";
import { checkIntegration, integrationAction, integrationStatus, listIntegrations, revokeIntegration } from "./integrations-api";
import { settingsCopy } from "./settings-copy";
import styles from "./SettingsSecondary.module.css";

const SERVICES: { provider: OrbitIntegrationProvider; name: string; note: "calendarNote" | "gmailNote" | "graphNote" }[] = [
  { provider: "google_calendar", name: "Google Calendar", note: "calendarNote" },
  { provider: "gmail", name: "Gmail", note: "gmailNote" },
  { provider: "microsoft_graph", name: "Microsoft 365", note: "graphNote" },
];

export function IntegrationsSettings() {
  const { language } = useOrbitLanguage();
  const t = settingsCopy(language);
  const toast = useToast();
  const [records, setRecords] = useState<IntegrationAuthorization[]>([]);
  const [busy, setBusy] = useState<OrbitIntegrationProvider | null>(null);
  const [removing, setRemoving] = useState<OrbitIntegrationProvider | null>(null);
  const [error, setError] = useState("");
  const reload = async () => {
    try { setRecords(await listIntegrations()); setError(""); }
    catch { setError(t("failed")); }
  };
  useEffect(() => { void reload(); }, []); // initial list; language changes navigate the page

  const health = async (provider: OrbitIntegrationProvider) => {
    setBusy(provider);
    try { await checkIntegration(provider); await reload(); toast.success(t("saved")); }
    catch { toast.error(t("failed")); }
    finally { setBusy(null); }
  };
  const disconnect = async () => {
    const provider = removing;
    if (!provider) return;
    setBusy(provider);
    setRemoving(null);
    try { await revokeIntegration(provider); await reload(); toast.success(t("saved")); }
    catch { toast.error(t("failed")); }
    finally { setBusy(null); }
  };

  return <>
    <div className={styles.page}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.stack}>
        {SERVICES.map(({ provider, name, note }) => {
          const record = records.find((item) => item.provider === provider);
          const state = integrationStatus(record);
          const action = integrationAction(provider, state);
          const label = state === "connected" ? t("connected") : state === "preparing" ? t("preparing") : state === "disconnected" ? t("disconnected") : t("actionRequired");
          return <Card key={provider}>
            <div className={styles.service}>
              <div className={styles.serviceMain}>
                <h2 className={styles.serviceTitle}>{name}<Chip label={label} tone={state === "connected" ? "ok" : state === "action_required" ? "coral" : "neutral"} /></h2>
                <p className={styles.detail}>{t(note)}</p>
              </div>
              <div className={styles.actions}>
                {action === "connect" ? <Button label={state === "disconnected" ? t("connect") : t("reconnect")} size="sm" onClick={() => window.location.assign(`/api/integrations/${provider}/authorize?returnTo=settings`)} disabled={busy !== null} /> : null}
                {action === "manage" ? <Button label={t("checkHealth")} size="sm" variant="secondary" onClick={() => void health(provider)} loading={busy === provider} disabled={busy !== null && busy !== provider} /> : null}
                {action === "manage" ? <Button label={t("disconnect")} size="sm" variant="dangerGhost" onClick={() => setRemoving(provider)} disabled={busy !== null} /> : null}
              </div>
            </div>
          </Card>;
        })}
        <Card variant="flat"><div className={styles.service}><div className={styles.serviceMain}><h2 className={styles.serviceTitle}>Google Contacts <Chip label={t("preparing")} /></h2><p className={styles.detail}>{t("contactsNote")}</p></div></div></Card>
      </div>
    </div>
    <ConfirmDialog open={removing !== null} title={t("disconnectTitle")} message={t("disconnectMessage")} confirmLabel={t("disconnect")} cancelLabel={t("cancel")} destructive onConfirm={() => void disconnect()} onCancel={() => setRemoving(null)} />
  </>;
}
