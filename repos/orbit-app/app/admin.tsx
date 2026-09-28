import { AdminScreen } from "../src/screens/admin/AdminScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";
import { withOnlineOnlyRoute } from "../src/components/OnlineOnlyBoundary";

function AdminRoute() {
  return <AdminScreen surface="dashboard" />;
}

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(AdminRoute));