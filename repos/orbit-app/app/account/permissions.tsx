import { Redirect } from "expo-router";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
function PermissionsRoute() { return <Redirect href="/settings" />; }
export default withOrbitPrivateRoute(PermissionsRoute);
