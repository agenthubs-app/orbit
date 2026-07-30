import { HomeScreen } from "../../src/screens/home/HomeScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function HomeEventsRoute() {
  return <HomeScreen mode="events" />;
}

export default withOrbitPrivateRoute(HomeEventsRoute);
