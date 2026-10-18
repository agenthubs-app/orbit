import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R11b: the old graph link opens 人脈分析 on 構造.
function ContactsGraphRoute() {
  return <Redirect href="/contacts/dashboard?tab=structure" />;
}

export default withOrbitPrivateRoute(ContactsGraphRoute);
