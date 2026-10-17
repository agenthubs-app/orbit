import { Redirect } from "expo-router";
import { ApiSettingsScreen } from "../../src/screens/settings/ApiSettingsScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function DevelopmentApiSettingsRoute() {
  if (typeof __DEV__ === "undefined" || !__DEV__) return <Redirect href="/settings" />;
  return <ApiSettingsScreen />;
}

export default withOrbitPrivateRoute(DevelopmentApiSettingsRoute);
