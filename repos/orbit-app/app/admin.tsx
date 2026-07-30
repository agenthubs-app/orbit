import { AdminScreen } from "../src/screens/admin/AdminScreen";
import { withOrbitPrivateRoute } from "../src/components/OrbitRouteAccessBoundary";

function AdminRoute() {
  return <AdminScreen surface="dashboard" />;
}

export default withOrbitPrivateRoute(AdminRoute);
