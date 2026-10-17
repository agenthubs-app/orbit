import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { HostJoinScreen } from "../../../src/screens/host/HostJoin";

// R17 共同運営に参加 · App 落地（b12 #416）。Online-only: the invite is checked and granted by the server.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostJoinScreen));
