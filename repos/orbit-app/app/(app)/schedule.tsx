import { LegacyTaskRedirect } from "../../src/components/LegacyTaskRedirect";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// R05: /schedule → /task?seg=calendar. The detail pages under /schedule/… stay secondary pages.
export default withOrbitPrivateRoute(LegacyTaskRedirect);
