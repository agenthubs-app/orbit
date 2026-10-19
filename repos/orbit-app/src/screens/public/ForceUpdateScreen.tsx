import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";

import { loadAppVersionGate } from "../../api/app-version";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { AppScreen } from "../../components/AppScreen";
import { UiText } from "../../components/ui";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import type { AppVersionGateDecision } from "../../view-models/app-version-policy";
import { forceUpdateRouteTarget, validAppStoreUrl } from "../../view-models/force-update-view";
import { ForceUpdateContent } from "./ForceUpdateContent";

const storeUrl = validAppStoreUrl(process.env.EXPO_PUBLIC_ORBIT_APP_STORE_URL);

export function ForceUpdateScreen() {
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const client = useOrbitApiClient();
  const { t } = useOrbitLocale();
  const [decision, setDecision] = useState<AppVersionGateDecision | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const check = useCallback(async () => {
    const next = await loadAppVersionGate(client, Constants.expoConfig?.version).catch(() => ({ kind: "allow", diagnostic: "policy-unavailable" } as const));
    const destination = forceUpdateRouteTarget(next, Boolean(auth.user?.id));
    if (destination) router.replace(destination);
    else setDecision(next);
  }, [auth.user?.id, client, router]);

  useEffect(() => { void check(); }, [check]);

  const openStore = async () => {
    if (!storeUrl) return;
    setOpenError(null);
    try { await Linking.openURL(storeUrl); }
    catch { setOpenError(t("publicInfo.storeOpenError")); }
  };

  return <AppScreen inset="kit" title="" showBack={false} header={<></>}>
    {decision?.kind === "force-update"
      ? <ForceUpdateContent t={t} storeUrl={storeUrl} onUpdate={() => { void openStore(); }} error={openError} />
      : <View accessibilityRole="progressbar"><ActivityIndicator /><UiText>{t("publicInfo.checkingStatus")}</UiText></View>}
  </AppScreen>;
}
