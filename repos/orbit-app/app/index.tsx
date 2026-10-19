import { Redirect, type Href } from "expo-router";

import { View } from "react-native";
import { useOrbitAuthSession } from "../src/api/AuthSessionProvider";
import { WelcomeScreen } from "../src/screens/public/WelcomeScreen";
import { resolveWelcomeEntry } from "../src/screens/public/welcome-entry";

export default function IndexRoute() {
  const auth = useOrbitAuthSession();
  const entry = resolveWelcomeEntry({
    ready: auth.ready,
    userId: auth.user?.id ?? null,
    configuredRoute: process.env.EXPO_PUBLIC_ORBIT_INITIAL_ROUTE
  });
  if (entry === "pending") return <View />;
  if (entry === "welcome") return <WelcomeScreen />;
  return <Redirect href={entry as Href} />;
}
