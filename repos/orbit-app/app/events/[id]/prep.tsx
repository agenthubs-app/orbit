import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PrepPage } from "../../../src/screens/events/v2/PrepPage";

// R27 会う準備（b2 #24）。Online-only: people, openers and the checklist come from the server.
function EventPrepRoute() {
  return <PrepPage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventPrepRoute));
