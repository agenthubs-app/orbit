import { AdminScreen } from "../../src/screens/admin/AdminScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function AdminEventsRoute() {
  return <AdminScreen surface="events" />;
}

export default withOrbitPrivateRoute(AdminEventsRoute);
