import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function HomeRoute() {
  return <Redirect href="/ai" />;
}

export default withOrbitPrivateRoute(HomeRoute);
