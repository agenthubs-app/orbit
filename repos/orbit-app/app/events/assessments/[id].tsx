import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { AssessmentResultScreen } from "../../../src/screens/events/v2/AssessScreens";

// R26 評価結果（app.html #31）と読み取れない時（b2 #0–#3）。Online-only: scores are recomputed on the server.
function EventAssessmentRoute() {
  return <AssessmentResultScreen />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventAssessmentRoute));
