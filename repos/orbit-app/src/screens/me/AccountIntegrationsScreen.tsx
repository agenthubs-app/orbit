import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { AppScreen } from "../../components/AppScreen";
import { Button, Skeleton, UiText, presentConfirm } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AccountIntegrationsContent } from "./AccountIntegrationsContent";
import { integrationAuthorizePath, type AccountIntegration } from "./settings-api";
import { useAccountSettingsApi } from "./useAccountSettingsApi";
import { useAccountDesign } from "./useAccountDesign";
import { useAccountPath } from "./useAccountProfile";

export function AccountIntegrationsScreen() {
  const api = useAccountSettingsApi(); const { baseUrl } = useOrbitApiBaseUrl(); const { t } = useOrbitLocale();
  const design = useAccountDesign(); const designMode = useAccountPath().includes("?design=");
  const [records, setRecords] = useState<AccountIntegration[] | null>(null); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null); const current = useRef(api); current.current = api;
  const load = useCallback(async () => {
    if (designMode) { if (design) setRecords(design.fixtures.integrations[design.variant].map(value => ({ ...value }))); return; }
    const signal = controller.current?.signal; const values = await api.integrations(signal); if (!signal?.aborted && current.current === api) { setRecords(values); setFailed(values === null); }
  }, [api, designMode, design?.fixtures, design?.variant]);
  useEffect(() => { const abort = new AbortController(); controller.current = abort; setRecords(null); setFailed(false); setBusy(false); void load(); const listener = AppState.addEventListener("change", state => { if (state === "active") void load(); }); return () => { abort.abort(); listener.remove(); }; }, [load]);
  async function connect(provider: "gmail" | "google_calendar") {
    if (designMode) { setRecords(values => values?.map(value => value.provider === provider ? { ...value, status: "active", healthStatus: "healthy" } : value) ?? null); return; }
    if (busy) return; setBusy(true);
    try { await WebBrowser.openBrowserAsync(`${baseUrl.replace(/\/$/, "")}${integrationAuthorizePath(provider, Platform.OS !== "web")}`); if (current.current === api) await load(); }
    catch { if (current.current === api) setFailed(true); }
    finally { if (current.current === api) setBusy(false); }
  }
  async function disconnect(provider: "gmail" | "google_calendar") {
    if (busy || !await presentConfirm({ title: t("me.disconnectTitle"), confirmLabel: t("me.disconnect"), cancelLabel: t("common.cancel"), destructive: true })) return;
    if (controller.current?.signal.aborted || current.current !== api) return;
    if (designMode) { setRecords(values => values?.map(value => value.provider === provider ? { ...value, status: "revoked" } : value) ?? null); return; }
    setBusy(true);
    const success = await api.disconnect(provider, controller.current?.signal);
    if (current.current === api && !controller.current?.signal.aborted) { if (success) await load(); else setFailed(true); setBusy(false); }
  }
  return <AppScreen title={t("me.integrations")}>
    {!records && !failed ? <Skeleton onRetry={() => void load()} /> : null}
    {failed ? <><UiText accessibilityRole="alert">{t("me.failed")}</UiText>
      <Button label={t("me.retry")} onPress={() => void load()} /></> : null}
    {records ? <AccountIntegrationsContent records={records} t={t} busy={busy} onConnect={provider => void connect(provider)} onDisconnect={provider => void disconnect(provider)} /> : null}
  </AppScreen>;
}
