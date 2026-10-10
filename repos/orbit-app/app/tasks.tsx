import { LegacyTaskRedirect } from "../src/components/LegacyTaskRedirect";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

// R05: /tasks → /task?seg=todo (keeps scope / view).
export default withOrbitPrivateRoute(LegacyTaskRedirect);
