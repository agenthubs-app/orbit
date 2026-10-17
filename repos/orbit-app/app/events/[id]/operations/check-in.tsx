import { withOrbitPrivateRoute } from "../../../../src/components/OrbitRouteAccessBoundary";
import { HostCheckInScreen } from "../../../../src/screens/host/HostCheckIn";

// R17 受付（b6 #24，b12 #428）。Local-first for check-in staff: the day's roster is cached on this device (TTL = cacheUntil),
// arrivals made offline queue in expo-sqlite and are re-sent with their idempotency keys; no online-only boundary.
export default withOrbitPrivateRoute(HostCheckInScreen);
