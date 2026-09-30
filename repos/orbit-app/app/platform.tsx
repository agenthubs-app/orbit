import { PlatformScreen } from "../src/screens/platform/PlatformScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { withOnlineOnlyRoute } from "../src/components/OnlineOnlyBoundary";

function PlatformRoute() {
  return <PlatformScreen />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlatformRoute));