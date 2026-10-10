import { useLocalSearchParams } from "expo-router";

import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { PlanManualEditScreen } from "../../../../src/screens/plan/PlanManualEditScreen";

// R23: manual edit of a plan draft, once, saving confirms (Web /app/plans/drafts/[draftId]/edit).
// Opened from the flow page; no tab bar; online-only (docs/offline/page-inventory.md).
function PlanManualEditRoute() {
  const params = useLocalSearchParams<{ draftId?: string | string[] }>();
  const draftId = (Array.isArray(params.draftId) ? params.draftId[0] : params.draftId) ?? "";
  return <PlanManualEditScreen key={draftId} draftId={draftId} />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(PlanManualEditRoute));
