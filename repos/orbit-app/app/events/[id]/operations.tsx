import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { HostConsoleScreen } from "../../../src/screens/host/HostConsole";

// R17 イベント運営（?seg=overview|matching|people|check-in|report；b6 #23，b12 #422 / #424 / #430）。
// Online-only: host operations are live (design class C, never cached).
export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostConsoleScreen));
