import { LegacyTaskRedirect } from "../src/components/LegacyTaskRedirect";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

// R05: /today → /task?seg=todo (the add box sits on top of To-do).
export default withOrbitPrivateRoute(LegacyTaskRedirect);
