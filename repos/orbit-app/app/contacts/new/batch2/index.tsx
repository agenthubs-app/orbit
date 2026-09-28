import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { BusinessCardIngestStartScreen } from "../../../../src/screens/contacts/BusinessCardIngestStartScreen";
import { withOnlineOnlyRoute } from "../../../../src/components/OnlineOnlyBoundary";
// Sprint 0131: online-only page (docs/offline/page-inventory.md); offline it shows 「需要联网」, not an error page.
export default withOnlineOnlyRoute(withOrbitPrivateRoute(BusinessCardIngestStartScreen));