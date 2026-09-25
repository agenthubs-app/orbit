import { HomeScreen } from "../../src/screens/home/HomeScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function HomeEventsRoute() {
  return <HomeScreen />;
}

export default withOrbitPrivateRoute(HomeEventsRoute);
