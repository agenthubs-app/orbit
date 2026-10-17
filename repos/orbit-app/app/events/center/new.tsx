import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { HostPcOnlyScreen } from "../../../src/screens/host/HostPcOnly";

// R17：App 不建活动（画板「PC が便利です」）→ 说明卡 +「PC で開くリンクを自分に送る」。Online-only: the link is written to the inbox by the server.
function HostCreateRoute() {
  return <HostPcOnlyScreen kind="create" />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(HostCreateRoute));
