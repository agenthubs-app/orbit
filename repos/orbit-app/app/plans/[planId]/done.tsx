import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PlanDoneScreen } from "../../../src/screens/plan/PlanDoneScreen";

// R25: 目標達成 → 完了 → 次の目標 (Web /app/plans/[planId]/done). Pushed from Task › プラン
// (達成 or an achieved goal in the switcher); back returns there (parentForPath).
// Online-only (docs/offline/page-inventory.md).
function PlanDoneRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = (Array.isArray(params.planId) ? params.planId[0] : params.planId) ?? "";
  return <PlanDoneScreen key={planId} planId={planId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanDoneRoute));
