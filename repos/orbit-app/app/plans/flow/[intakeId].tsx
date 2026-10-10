import { Stack, useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PlanFlowScreen } from "../../../src/screens/plan/PlanFlowScreen";

// R23: the plan generation flow (Web /app/plans/flow/[intakeId]). Full screen, pushed
// from below, no tab bar; online-only (docs/offline/page-inventory.md).
function PlanFlowRoute() {
  const params = useLocalSearchParams<{ intakeId?: string | string[] }>();
  const intakeId = (Array.isArray(params.intakeId) ? params.intakeId[0] : params.intakeId) ?? "";
  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <PlanFlowScreen key={intakeId} intakeId={intakeId} />
    </>
  );
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanFlowRoute));
