import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { AssessInputScreen } from "../../src/screens/events/v2/AssessScreens";

// R26 イベント評価の入力（URL / ポスター / 3項目 / 参加コード; app.html #30）。
// Online-only: the read and the score run on the server (docs/offline/page-inventory.md).
function EventAssessRoute() {
  return <AssessInputScreen />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(EventAssessRoute));
