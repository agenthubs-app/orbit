import { withOnlineOnlyRoute } from "../../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ScanCaptureScreen } from "../../../src/screens/add/ScanCaptureScreen";

// R12 名刺をスキャン (DESIGN §2.2 steps 1–3): guide, camera permission, camera / photos, upload.
// Online-only: reading runs on the server (docs/offline/page-inventory.md).
export default withOrbitPrivateRoute(withOnlineOnlyRoute(ScanCaptureScreen));
