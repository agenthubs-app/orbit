import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { AfterPage } from "../../../src/screens/events/v2/AfterPage";

// R27 会後のふりかえり（b2 #37–#39）。Online-only: the summary, next steps and score come from the server.
function EventAfterRoute() {
  return <AfterPage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventAfterRoute));
