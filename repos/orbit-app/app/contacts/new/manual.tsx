import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ManualContactScreen } from "../../../src/screens/add/ManualContactScreen";

// R12 手入力 (DESIGN §2.3): a name is enough; duplicates checked as you type; 5 s undo.
// Online-only: saving and the duplicate check run on the server (docs/offline/page-inventory.md).
function ManualContactRoute() {
  return <ManualContactScreen />;
}

export default withOrbitPrivateRoute(withOnlineOnlyRoute(ManualContactRoute));
