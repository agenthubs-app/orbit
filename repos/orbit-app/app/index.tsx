import { Redirect, type Href } from "expo-router";

import { useState } from "react";
import { View } from "react-native";
import { useOrbitAuthSession } from "../src/api/AuthSessionProvider";
import { WelcomeScreen } from "../src/screens/public/WelcomeScreen";
import { resolveWelcomeEntry } from "../src/screens/public/welcome-entry";

export default function IndexRoute() {
  const auth = useOrbitAuthSession();
  // Google from the welcome page opens onboarding itself; the new session must not redirect to Home first.
  const [signingIn, setSigningIn] = useState(false);
  const entry = resolveWelcomeEntry({
    ready: auth.ready,
    userId: auth.user?.id ?? null,
    deletionPending: auth.deletionPending,
    configuredRoute: process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE
  });
  if (entry === "pending") return <View />;
  if (entry === "welcome" || signingIn) return <WelcomeScreen onSigningIn={setSigningIn} />;
  return <Redirect href={entry as Href} />;
}
