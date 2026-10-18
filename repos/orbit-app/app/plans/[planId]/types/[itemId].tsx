import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { designState } from "../../../../src/screens/add/design-state";
import { PlanTypeScreen } from "../../../../src/screens/plan/PlanTypeScreen";

// R24: 人物タイプ詳細 (Web /app/plans/[planId]/types/[itemId]). Pushed from Task › プラン;
// back returns there (parentForPath). Online-only (docs/offline/page-inventory.md).
function PlanTypeRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[]; itemId?: string | string[]; design?: string | string[] }>();
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const planId = first(params.planId);
  const itemId = first(params.itemId);
  // R31a (RD-28): `design=` opens a sheet / dialog for the pixel gate — read only in a dev build with open-path.
  return <PlanTypeScreen key={`${planId}/${itemId}`} planId={planId} itemId={itemId} design={designState(params.design)} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanTypeRoute));
