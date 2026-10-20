import { DeletionScreen } from "../../src/screens/account-rights/DeletionScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

export default withOrbitPrivateRoute(withOnlineOnlyRoute(DeletionScreen));
