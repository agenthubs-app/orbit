import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { InviteSenderScreen } from "../../../src/screens/add/invite/InviteSenderScreen";

// R15 招待コード · 発出方 (DESIGN §2.4): 説明 the first time, then QR / code / link / draft / これまでのコード.
// Online-only: the code is made, read and turned off on the server (docs/offline/page-inventory.md).
function InviteSenderRoute() {
  return <InviteSenderScreen />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(InviteSenderRoute));
