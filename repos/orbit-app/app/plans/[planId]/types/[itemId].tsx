import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { PlanTypeScreen } from "../../../../src/screens/plan/PlanTypeScreen";

// R24: 人物タイプ詳細 (Web /app/plans/[planId]/types/[itemId]). Pushed from Task › プラン;
// back returns there (parentForPath). Online-only (docs/offline/page-inventory.md).
function PlanTypeRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[]; itemId?: string | string[] }>();
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const planId = first(params.planId);
  const itemId = first(params.itemId);
  return <PlanTypeScreen key={`${planId}/${itemId}`} planId={planId} itemId={itemId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanTypeRoute));
