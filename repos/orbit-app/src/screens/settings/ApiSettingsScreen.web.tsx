import { DataCard } from "../../components/DataCard";
import { AppScreen } from "../../components/AppScreen";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

export function ApiSettingsScreen() {
  const locale = useOrbitLocale();
  const { baseUrl } = useOrbitApiBaseUrl();

  return (
    <AppScreen eyebrow="Orbit" title={locale.t("settings.server")}>
      <DataCard detail={baseUrl} title={locale.t("settings.apiCurrent")} />
    </AppScreen>
  );
}
