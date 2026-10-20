import { ExportsScreen } from "../../src/screens/account-rights/ExportsScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ExportsScreen));
