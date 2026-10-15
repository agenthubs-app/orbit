import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PlanNextGoalScreen } from "../../../src/screens/plan/PlanNextGoalScreen";

// R25 次の目標 (b4 #26): its own page, pushed from 完了's 「次の目標を決める」; back returns there.
// Online-only (docs/offline/page-inventory.md): the candidates come from the server (C10).
function PlanNextGoalRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = (Array.isArray(params.planId) ? params.planId[0] : params.planId) ?? "";
  return <PlanNextGoalScreen key={planId} planId={planId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanNextGoalRoute));
