import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { VenuePage } from "../../../src/screens/events/v2/VenuePage";

// R27 会場モード（b2 #26–#35）。Online-only: seats, rounds and exchanges come from the server.
function EventVenueRoute() {
  return <VenuePage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventVenueRoute));
