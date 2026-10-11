import { Redirect, type Href } from "expo-router";

// Web /app/start (the new-user guide) opens the App's own guide. Added in R12 so route
// parity holds once its stale exceptions were removed (the gap was hidden behind them).
export default function StartGuideRedirect() {
  return <Redirect href={"/profile/onboarding" as Href} />;
}
