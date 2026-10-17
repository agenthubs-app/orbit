import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { LegacyOperationsRedirect } from "../../../../src/screens/host/HostConsole";

// R17：旧「admission」页 → イベント運営 的「people」段（旧 Screen 由主会话统一删除）。
function LegacyAdmissionRedirect() {
  return <LegacyOperationsRedirect to="people" />;
}

export default withOrbitPrivateRoute(LegacyAdmissionRedirect);
