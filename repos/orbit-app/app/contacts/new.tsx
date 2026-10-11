import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { AddContactScreen } from "../../src/screens/add/AddContactScreen";

// R12 人脈を追加 (DESIGN §2.1): the doors page. Online-only (docs/offline/page-inventory.md).
export default withOrbitPrivateRoute(withOnlineOnlyRoute(AddContactScreen));
