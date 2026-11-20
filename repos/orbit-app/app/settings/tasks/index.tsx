import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ScheduledTasksScreen } from "../../../src/screens/me/ScheduledTasksScreens";
// agent-design AG15 (approved draft 15-3, D15-1): 我的 › 设置 › 定时任务.
export default withOrbitPrivateRoute(ScheduledTasksScreen);
