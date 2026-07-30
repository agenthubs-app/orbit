import { PlatformScreen } from "../src/screens/platform/PlatformScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function PlatformRoute() {
  return <PlatformScreen />;
}

export default withOrbitPrivateRoute(PlatformRoute);
