import { FollowupsScreen } from "../src/screens/followups/FollowupsScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function FollowupsRoute() {
  return <FollowupsScreen />;
}

export default withOrbitPrivateRoute(FollowupsRoute);
