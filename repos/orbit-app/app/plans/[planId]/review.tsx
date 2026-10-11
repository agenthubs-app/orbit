import { Stack, useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { PlanReviewScreen } from "../../../src/screens/plan/PlanReviewScreen";

// R25: 見直し (Web /app/plans/[planId]/review). Full screen, pushed from below, no tab
// bar; back returns to Task › プラン (parentForPath). Online-only (docs/offline/page-inventory.md).
function PlanReviewRoute() {
  const params = useLocalSearchParams<{ planId?: string | string[] }>();
  const planId = (Array.isArray(params.planId) ? params.planId[0] : params.planId) ?? "";
  return (
    <>
      <Stack.Screen options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
      <PlanReviewScreen key={planId} planId={planId} />
    </>
  );
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanReviewRoute));
