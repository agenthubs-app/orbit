import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ManualContactAddScreen } from "../../../src/screens/contacts/ManualContactAddScreen";
import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
// Sprint 0140: saving goes through the server draft + confirm; online-only like /contacts/new.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(ManualContactAddScreen));
