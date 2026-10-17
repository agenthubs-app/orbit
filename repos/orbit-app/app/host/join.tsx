import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { HostJoinScreen } from "../../src/screens/host/HostJoin";

// R17 共同運営に参加 · コード入力。Online-only: the code is checked by the server.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostJoinScreen));
