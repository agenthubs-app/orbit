import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { BusinessCardScanScreen } from "../../../src/screens/contacts/BusinessCardScanScreen";
import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
// Sprint 0140: card scanning needs the server for OCR and saving; online-only like /contacts/new.
export default withOrbitPrivateRoute(withOnlineOnlyRoute(BusinessCardScanScreen));
