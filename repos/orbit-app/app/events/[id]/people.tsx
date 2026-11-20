import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { EventPeoplePage } from "../../../src/screens/events/v2/EventPeoplePage";

// 2026-11-21 イベントの参加者 全名单（详情页「全員を見る」）。Online-only: the full roster comes from the server.
function EventPeopleRoute() {
  return <EventPeoplePage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventPeopleRoute));
