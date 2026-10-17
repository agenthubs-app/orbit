import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { LegacyOperationsRedirect } from "../../../../src/screens/host/HostConsole";

// R17：旧「roles」页 → イベント運営 的「overview」段（旧 Screen 由主会话统一删除）。
function LegacyRolesRedirect() {
  return <LegacyOperationsRedirect to="overview" />;
}

export default withOrbitPrivateRoute(LegacyRolesRedirect);
