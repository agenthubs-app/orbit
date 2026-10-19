import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { loadAppVersionGate } from "../../api/app-version";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { AppVersionGateDecision } from "../../view-models/app-version-policy";
import { formatMaintenanceUntil, maintenanceRouteTarget } from "../../view-models/maintenance-view";
import { MaintenanceContent } from "./MaintenanceContent";

export function MaintenanceScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const { language, t } = useOrbitLocale();
  const [decision, setDecision] = useState<AppVersionGateDecision | null>(null);
  const check = useCallback(async () => {
    const next = await loadAppVersionGate(client, Constants.expoConfig?.version).catch(() => ({ kind: "allow", diagnostic: "policy-unavailable" } as const));
    const destination = maintenanceRouteTarget(next, Boolean(auth.user?.id));
    if (destination) router.replace(destination);
    else setDecision(next);
  }, [auth.user?.id, client, router]);

  useEffect(() => { void check(); }, [check]);

  return <AppScreen inset="kit" title="" showBack={false} header={<></>}>
    {decision?.kind === "maintenance"
      ? <MaintenanceContent t={t} untilText={formatMaintenanceUntil(decision.until, language)} onRetry={() => { void check(); }} />
      : <View accessibilityRole="progressbar"><ActivityIndicator /><UiText>{t("publicInfo.checkingStatus")}</UiText></View>}
  </AppScreen>;
}
