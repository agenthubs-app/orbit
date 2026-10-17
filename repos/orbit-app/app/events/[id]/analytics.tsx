import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { LegacyOperationsRedirect } from "../../../src/screens/host/HostConsole";

// R17：旧「活动数据分析」→ イベント運営 的「レポート」段（App 只出摘要，详细在 PC）。
function LegacyAnalyticsRedirect() {
  return <LegacyOperationsRedirect to="report" />;
}

export default withOrbitPrivateRoute(LegacyAnalyticsRedirect);
