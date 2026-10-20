import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function DashboardRedirect() {
  return <Redirect href="/home" />;
}

export default withOrbitPrivateRoute(DashboardRedirect);
