import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { HostPcOnlyScreen } from "../../../../src/screens/host/HostPcOnly";

// R17：编辑一份主催者ページ在 PC 上做（画板「PC が便利です」）。Online-only: the link is written to the inbox by the server.
function HostProfileRoute() {
  return <HostPcOnlyScreen kind="profiles" />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostProfileRoute));
