import { Redirect, type Href } from "expo-router";

import { useState } from "react";
import { View } from "react-native";
import { useOrbitAuthSession } from "../src/api/AuthSessionProvider";
import { WelcomeScreen } from "../src/screens/public/WelcomeScreen";
import { resolveWelcomeEntry } from "../src/screens/public/welcome-entry";
import { useOnboardingGate } from "../src/onboarding/OnboardingGateProvider";
import { onboardingExemptRoute, onboardingGateHref } from "../src/onboarding/onboarding-gate";

export default function IndexRoute() {
  const auth = useOrbitAuthSession();
  // Google from the welcome page opens onboarding itself; the new session must not redirect to Home first.
  const [signingIn, setSigningIn] = useState(false);
  const gate = useOnboardingGate();
  const entry = resolveWelcomeEntry({
    ready: auth.ready,
    userId: auth.user?.id ?? null,
    deletionPending: auth.deletionPending,
    configuredRoute: process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE
  });
  if (entry === "pending") return <View />;
  if (entry === "welcome" || signingIn) return <WelcomeScreen onSigningIn={setSigningIn} />;
  // A cold start with unfinished onboarding opens it, not Home.
  if (gate.status !== "off" && !onboardingExemptRoute(entry.split(/[?#]/u)[0]!)) {
    if (gate.status === "unknown") return <View />;
    if (gate.status === "required") return <Redirect href={onboardingGateHref(entry) as Href} />;
  }
  return <Redirect href={entry as Href} />;
}
