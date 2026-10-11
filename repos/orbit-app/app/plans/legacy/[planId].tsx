import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PlanLegacyScreen } from "../../../src/screens/plan/PlanLegacy";

// R25: 以前のプラン — a v1 plan, read only (Web /app/plans/legacy/[planId]). Pushed from
// Task › プラン (the 以前のプラン card or the goal switcher); back returns there
// (parentForPath). Online-only (docs/offline/page-inventory.md).
function PlanLegacyRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = (Array.isArray(params.planId) ? params.planId[0] : params.planId) ?? "";
  return <PlanLegacyScreen key={planId} planId={planId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanLegacyRoute));
