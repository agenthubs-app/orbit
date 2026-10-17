import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { HostCenterScreen } from "../../src/screens/host/HostCenter";

// R17 運営センター（b6 #21 / #22，b12 #420）。Online-only: rows, KPI and todos are computed by the server from live permissions.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostCenterScreen));
