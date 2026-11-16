import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { ScheduleAvailabilityScreen } from "../../src/screens/settings/ScheduleAvailabilityScreen";

// contact-reach R42 ⑤: 設定 › 日程 (可約時間).
export default withOrbitPrivateRoute(ScheduleAvailabilityScreen);
