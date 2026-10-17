import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { AccountIntegrationsScreen } from "../../src/screens/me/AccountIntegrationsScreen";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
export default withOrbitPrivateRoute(withOnlineOnlyRoute(AccountIntegrationsScreen));
