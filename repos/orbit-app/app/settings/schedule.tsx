import { withOnlineOnlyRoute } from "../../src/components/OnlineOnlyBoundary";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { ScheduleAvailabilityScreen } from "../../src/screens/settings/ScheduleAvailabilityScreen";

// contact-reach R42 ⑤: 設定 › 日程 (可約時間) — saved on the server, so it needs the network (like 連携).
export default withOrbitPrivateRoute(withOnlineOnlyRoute(ScheduleAvailabilityScreen));
