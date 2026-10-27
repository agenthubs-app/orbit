import { Redirect, type Href } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// The old 我的活动 page (own list, stock photos) is retired: nothing links here any more, so an old link opens the 活动 tab.
function HomeEventsRedirect() {
  return <Redirect href={"/events" as Href} />;
}

export default withOrbitPrivateRoute(HomeEventsRedirect);
