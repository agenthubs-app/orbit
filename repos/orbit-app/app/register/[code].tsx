import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { RegisterCodePage } from "../../src/screens/events/v2/RegisterCodePage";

// R27 参加コード着地：查到活动 → 参加登録；查不到 → 重新输入。Online-only: the code is resolved on the server.
function RegisterCodeRoute() {
  return <RegisterCodePage />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(RegisterCodeRoute));
