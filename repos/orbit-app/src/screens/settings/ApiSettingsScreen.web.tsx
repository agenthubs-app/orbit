import { DataCard } from "../../components/DataCard";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";

export function ApiSettingsScreen() {
  const locale = useOrbitLocale();
  const { baseUrl } = useOrbitApiBaseUrl();
  const mirror = useWebMirrorStatus();
  const mirrorDetail = mirror.mode === "local-mirror"
    ? locale.t(mirror.scopeDigest ? "settings.localMirrorActive" : "settings.localMirrorReady")
    : locale.t("settings.localMirrorOnlineOnly", {
      reason: locale.t(mirror.reason === "insecure-context" ? "settings.localMirrorReason.insecure-context" : "settings.localMirrorReason.unsupported"),
    });

  return (
    <AppScreen eyebrow="Orbit" title={locale.t("settings.server")}>
      <DataCard detail={baseUrl} title={locale.t("settings.apiCurrent")} />
      <DataCard detail={mirrorDetail} title={locale.t("settings.localMirror")} />
    </AppScreen>
  );
}
