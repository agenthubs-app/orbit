import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { VenuePage } from "../../../src/screens/events/v2/VenuePage";

// R27 会場モード（b2 #26–#35）。LF2: the server answer, with the last answer kept per event (page copy event-venue) for offline reading; exchanges need a connection.
function EventVenueRoute() {
  return <VenuePage />;
}

export default withOrbitPrivateRoute(EventVenueRoute);
