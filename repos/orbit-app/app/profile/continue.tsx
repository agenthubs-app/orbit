import { Redirect, type Href, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { readOnboardingProfile } from "../../src/api/profile-onboarding";
import { readProfileOnboardingProgress } from "../../src/api/profile-onboarding-progress";
import { AppScreen } from "../../src/components/AppScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { RetryCard, Skeleton } from "../../src/components/ui";
import { useOrbitApiClient } from "../../src/hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../src/i18n/OrbitLocaleContext";
import { onboardingRequired } from "../../src/view-models/profile-onboarding";
import { profileContinuationHref, safeProfileContinuationNext } from "../../src/view-models/profile-continuation-route";

function ProfileContinueRoute() {
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const client = useOrbitApiClient();
  const { t } = useOrbitLocale();
  const [result, setResult] = useState<"loading" | "error" | "onboarding" | "next">("loading");
  const reload = useCallback(async () => {
    setResult("loading");
    const [profile, flow] = await Promise.all([readOnboardingProfile(client), readProfileOnboardingProgress(client)]);
    if (!profile.ok || !flow.ok) { setResult("error"); return; }
    setResult(onboardingRequired(profile.detail, flow.progress) ? "onboarding" : "next");
  }, [client]);
  useEffect(() => { void reload(); }, [reload]);
  if (result === "onboarding") return <Redirect href={profileContinuationHref(params.next) as Href} />;
  if (result === "next") return <Redirect href={safeProfileContinuationNext(params.next) as Href} />;
  return <AppScreen inset="kit" title={t("onboarding.v3.title")}>
    {result === "loading" ? <Skeleton lines={3} /> : <RetryCard title={t("onboarding.v3.loadFailed")} onRetry={() => void reload()} />}
  </AppScreen>;
}

export default withOrbitPrivateRoute(ProfileContinueRoute);
