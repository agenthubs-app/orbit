import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { EventDetailPage } from "../../src/screens/events/v2/EventDetailPage";

// R27 イベント詳細（b2 #14–#16）。LF2: the server answer, with the last answer kept per event (page copy event-overview) for offline reading.
function EventDetailRoute() {
  return <EventDetailPage />;
}

export default withOrbitPrivateRoute(EventDetailRoute);
