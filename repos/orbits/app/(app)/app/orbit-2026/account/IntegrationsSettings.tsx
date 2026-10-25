"use client";

import { useEffect, useState } from "react";

import type { IntegrationAuthorization, OrbitIntegrationProvider } from "../../../../../features/integrations/contract";
import { useOrbitLanguage } from "../../orbit-language-context";
import { Button, Chip, ConfirmDialog, MacTile, useToast } from "../ui";
import { checkIntegration, integrationAction, integrationStatus, listIntegrations, revokeIntegration } from "./integrations-api";
import { settingsCopy } from "./settings-copy";
import styles from "./SettingsSecondary.module.css";

// b5 #28 / b12 W-R18a-11: three service cards (Gmail · Google カレンダー · Google 連絡先) and the
// 「読むもの・読まないもの」 card. Microsoft 365 is not on the board; its card appears only once it is
// actually available (not 「準備中」), so a real connection is never hidden.
const SERVICES: { provider: OrbitIntegrationProvider; name: "Gmail" | "Microsoft 365" | "calendarName"; emoji: string; tone: "blue" | "apricot" | "lav"; note: "gmailCard" | "calendarCard" | "graphCard" }[] = [
  { provider: "gmail", name: "Gmail", emoji: "📧", tone: "blue", note: "gmailCard" },
  { provider: "google_calendar", name: "calendarName", emoji: "📅", tone: "apricot", note: "calendarCard" },
  { provider: "microsoft_graph", name: "Microsoft 365", emoji: "🗂️", tone: "lav", note: "graphCard" },
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
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <div className={styles.connGrid}>
      {SERVICES.map(({ provider, name, emoji, tone, note }) => {
        const record = records.find((item) => item.provider === provider);
        const state = integrationStatus(record);
        if (provider === "microsoft_graph" && state === "preparing") return null;
        const action = integrationAction(provider, state);
        const label = state === "connected" ? t("connected") : state === "preparing" ? t("preparing") : state === "disconnected" ? t("disconnected") : t("actionRequired");
        return <section key={provider} className={styles.connCard}>
          <div className={styles.connHead}><MacTile emoji={emoji} tone={tone} /><Chip label={label} tone={state === "connected" ? "teal" : state === "preparing" ? "apricot" : state === "action_required" ? "coral" : "neutral"} /></div>
          <h2 className={styles.connTitle}>{name === "calendarName" ? t(name) : name}</h2>
          <p className={styles.connNote}>{t(note)}</p>
          <div className={styles.connFoot}>
            {action === "connect" ? <Button label={state === "disconnected" ? t("connect") : t("reconnect")} size="sm" onClick={() => window.location.assign(`/api/integrations/${provider}/authorize?returnTo=settings`)} disabled={busy !== null} /> : null}
            {action === "manage" ? <button type="button" className={`btn ${styles.release}`} onClick={() => setRemoving(provider)} disabled={busy !== null}>{t("release")}</button> : null}
            {action === "manage" && record?.healthStatus === "not_checked" ? <Button label={t("checkHealth")} size="sm" variant="ghost" onClick={() => void health(provider)} loading={busy === provider} disabled={busy !== null && busy !== provider} /> : null}
          </div>
        </section>;
      })}
      <section className={styles.connCard}>
        <div className={styles.connHead}><MacTile emoji="👥" tone="teal" /><Chip label={t("preparing")} tone="apricot" /></div>
        <h2 className={styles.connTitle}>{t("contactsName")}</h2>
        <p className={styles.connNote}>{t("contactsCard")}</p>
        <div className={styles.connFoot} />
      </section>
      <section className={styles.readCard}>
        <h3>{t("readTitle")}</h3>
        <div className={styles.readGrid}>
          <div className={styles.readYes}><b>{t("readYes")}</b><br />{t("readYes1")}<br />{t("readYes2")}</div>
          <div className={styles.readNo}><b>{t("readNo")}</b><br />{t("readNo1")}<br />{t("readNo2")}</div>
        </div>
      </section>
    </div>
    <ConfirmDialog open={removing !== null} title={t("disconnectTitle")} message={t("disconnectMessage")} confirmLabel={t("disconnect")} cancelLabel={t("cancel")} destructive onConfirm={() => void disconnect()} onCancel={() => setRemoving(null)} />
  </>;
}
