import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { EventDetailPage } from "../../src/screens/events/v2/EventDetailPage";

// R27 イベント詳細（b2 #14–#16）。Online-only: the assessment strip and attendees come from the server.
function EventDetailRoute() {
  return <EventDetailPage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventDetailRoute));
