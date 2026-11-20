import { withOrbitPrivateRoute } from "../../../src/components/OrbitRouteAccessBoundary";
import { ScheduledTaskScreen } from "../../../src/screens/me/ScheduledTasksScreens";
// agent-design AG15 (approved draft 15-4): one scheduled task.
export default withOrbitPrivateRoute(ScheduledTaskScreen);
