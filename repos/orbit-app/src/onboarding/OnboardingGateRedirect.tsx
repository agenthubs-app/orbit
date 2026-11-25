import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { resetStackTo } from "../components/shell-navigation";
import { mobileAuthReturnHref } from "../view-models/mobile-route-access";
import { useOnboardingGate } from "./OnboardingGateProvider";
import { onboardingExemptRoute, onboardingGateHref } from "./onboarding-gate";

/** Sends an account with unfinished onboarding there from wherever it landed (deep link, notification, restored page). */
export function OnboardingGateRedirect() {
  const { status } = useOnboardingGate();
  const pathname = usePathname();
  const params = useGlobalSearchParams() as Record<string, string | string[] | undefined>;
  const router = useRouter();
  const blocked = status === "required" && !onboardingExemptRoute(pathname);
  const href = blocked ? onboardingGateHref(mobileAuthReturnHref(pathname, params)) : null;
  useEffect(() => {
    if (href) resetStackTo(router, href);
  }, [href, router]);
  return null;
}
