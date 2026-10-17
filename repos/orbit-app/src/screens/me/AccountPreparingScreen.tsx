import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
export function AccountPreparingScreen() { const { t } = useOrbitLocale(); return <AppScreen title={t("me.preparing")}><EmptyState title={t("me.preparing")} message={t("me.preparingHint")} /></AppScreen>; }
