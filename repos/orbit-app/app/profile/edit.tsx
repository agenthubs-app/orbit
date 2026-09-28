import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { EditProfileScreen } from "../../src/screens/profile/EditProfileScreen";
import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";

// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(EditProfileScreen));