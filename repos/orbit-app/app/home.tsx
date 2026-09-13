import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { HomeDashboardScreen } from "../src/screens/home/HomeDashboardScreen";

function HomeRoute() {
  return <HomeDashboardScreen />;
}

export default withOrbitPrivateRoute(HomeRoute);
